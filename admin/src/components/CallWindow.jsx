import React, { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { DoctorContext } from '../context/DoctorContext'
import { SocketContext } from '../context/SocketContext'
import { assets } from '../assets/assets'
import Peer from 'peerjs'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import './CallWindow.css'

/**
 * CallWindow — WebRTC peer-to-peer call via PeerJS public cloud + Socket.IO signaling
 * With dual-stream chunked audio recording for AI consultation documentation.
 */
const CallWindow = ({ appointment, isCaller, isAudioOnly = false, onClose }) => {
    const { profileData, backendUrl, dToken } = useContext(DoctorContext)
    const { socket, onlineUsers } = useContext(SocketContext)
    const navigate = useNavigate()

    const [callStatus, setCallStatus] = useState(isCaller ? 'Ringing...' : 'Connecting...')
    const [localStream, setLocalStream] = useState(null)
    const [remoteStream, setRemoteStream] = useState(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isCameraOff, setIsCameraOff] = useState(false)
    const [callDuration, setCallDuration] = useState(0)
    const [permissionError, setPermissionError] = useState(null)
    const [recordingStatus, setRecordingStatus] = useState('idle') // idle | recording | uploading

    // Screen Sharing states
    const [isScreenSharing, setIsScreenSharing] = useState(false)
    const screenTrackRef = useRef(null)

    // Collapsible Chat states
    const [chatOpen, setChatOpen] = useState(false)
    const [messages, setMessages] = useState([])
    const [chatInput, setChatInput] = useState('')
    const [uploadingFile, setUploadingFile] = useState(false)

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const peerRef = useRef(null)
    const currentCallRef = useRef(null)
    const timerIntervalRef = useRef(null)
    const localStreamRef = useRef(null)  // stable ref for closures
    const fileInputRef = useRef(null)
    const messagesEndRef = useRef(null)

    // ─── Recording refs ──────────────────────────────────────────────────────
    const consultationIdRef = useRef(null)          // set by socket 'consultation-created'
    const doctorRecorderRef = useRef(null)          // MediaRecorder for local (doctor) audio
    const patientRecorderRef = useRef(null)         // MediaRecorder for remote (patient) audio
    const doctorChunksRef = useRef([])              // buffer for current 10s window
    const patientChunksRef = useRef([])
    const chunkIntervalRef = useRef(null)           // 10s upload timer
    const chunkSeqRef = useRef(0)                   // global chunk sequence counter
    const remoteStreamRef = useRef(null)            // stable ref for remote stream

    const patientName = appointment?.userData?.name || 'Patient'
    const patientImage = appointment?.userData?.image || ''
    const appointmentId = appointment?._id
    const patientPeerId = appointment?.userId

    // Check if the patient is online
    const isPatientOnline = onlineUsers ? onlineUsers.has(patientPeerId) : false

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    const cleanUp = useCallback(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current)
        if (screenTrackRef.current) {
            try { screenTrackRef.current.stop() } catch (_) {}
            screenTrackRef.current = null
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
            localStreamRef.current = null
        }
        if (currentCallRef.current) {
            try { currentCallRef.current.close() } catch (_) {}
            currentCallRef.current = null
        }
        if (peerRef.current) {
            try { peerRef.current.destroy() } catch (_) {}
            peerRef.current = null
        }
    }, [])

    // ─── Timer ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (callStatus === 'Connected') {
            timerIntervalRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1)
            }, 1000)
        } else {
            clearInterval(timerIntervalRef.current)
        }
        return () => clearInterval(timerIntervalRef.current)
    }, [callStatus])

    // ─── Attach stream to video element ───────────────────────────────────────
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream
        }
    }, [localStream])

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream
        }
        remoteStreamRef.current = remoteStream
    }, [remoteStream])

    // ─── Chat History Fetch ──────────────────────────────────────────────────
    useEffect(() => {
        if (chatOpen && appointmentId && dToken) {
            axios.get(`${backendUrl}/api/chat/doctor/messages/${appointmentId}`, { headers: { dtoken: dToken } })
                .then(({ data }) => {
                    if (data.success) {
                        setMessages(data.messages)
                    }
                })
                .catch(err => console.log('[Call Chat] Error fetching history:', err))
        }
    }, [chatOpen, appointmentId, backendUrl, dToken])

    // Scroll to bottom of chat
    useEffect(() => {
        if (chatOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, chatOpen])

    // ─── Audio Recording helpers ──────────────────────────────────────────────

    /** Upload a buffer of chunks as a single audio blob */
    const uploadChunk = useCallback(async (chunks, speaker) => {
        if (!chunks.length || !consultationIdRef.current) return
        const seq = chunkSeqRef.current++
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (blob.size < 500) return // skip near-empty chunks

        try {
            const formData = new FormData()
            formData.append('audio', blob, `chunk-${speaker}-${seq}.webm`)
            formData.append('speaker', speaker)
            formData.append('sequence', seq)
            await axios.post(
                `${backendUrl}/api/doctor/consultations/${consultationIdRef.current}/audio-chunk`,
                formData,
                { headers: { dtoken: dToken, 'Content-Type': 'multipart/form-data' } }
            )
            console.log(`[Recording] Uploaded ${speaker} chunk seq=${seq}, size=${blob.size}b`)
        } catch (err) {
            console.warn(`[Recording] Chunk upload failed (seq=${seq} speaker=${speaker}):`, err.message)
        }
    }, [backendUrl, dToken])

    /** Start recording both streams every 10 seconds */
    const startDualRecording = useCallback((localSt, remoteSt) => {
        if (!localSt) return
        console.log('[Recording] Starting dual-stream recording')
        setRecordingStatus('recording')

        // Fallback HTTP call to ensure consultationId is loaded if socket is delayed/failed
        if (!consultationIdRef.current) {
            axios.post(
                `${backendUrl}/api/doctor/consultations/from-call`,
                { appointmentId },
                { headers: { dtoken: dToken } }
            ).then(({ data }) => {
                if (data.success && data.consultationId) {
                    consultationIdRef.current = data.consultationId
                    console.log('[Doctor CallWindow] Consultation retrieved via HTTP fallback:', data.consultationId)
                }
            }).catch(err => {
                console.warn('[Doctor CallWindow] HTTP fallback fetch consultation failed:', err.message)
            })
        }

        const getSupportedMimeType = () => {
            const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
            return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
        }
        const mimeType = getSupportedMimeType()
        const opts = mimeType ? { mimeType } : {}

        // Doctor recorder — only audio tracks from localStream
        try {
            const doctorAudioCtx = new AudioContext()
            const doctorDest = doctorAudioCtx.createMediaStreamDestination()
            localSt.getAudioTracks().forEach(track => {
                const src = doctorAudioCtx.createMediaStreamSource(new MediaStream([track]))
                src.connect(doctorDest)
            })

            doctorRecorderRef.current = new MediaRecorder(doctorDest.stream, opts)
            doctorRecorderRef.current.ondataavailable = e => {
                if (e.data?.size > 0) doctorChunksRef.current.push(e.data)
            }
            doctorRecorderRef.current.start(1000) // collect data every 1s
        } catch (err) {
            console.warn('[Recording] Doctor recorder init failed:', err.message)
        }

        // Patient recorder — only audio tracks from remoteStream (if available)
        if (remoteSt) {
            try {
                const patientAudioCtx = new AudioContext()
                const patientDest = patientAudioCtx.createMediaStreamDestination()
                remoteSt.getAudioTracks().forEach(track => {
                    const src = patientAudioCtx.createMediaStreamSource(new MediaStream([track]))
                    src.connect(patientDest)
                })

                patientRecorderRef.current = new MediaRecorder(patientDest.stream, opts)
                patientRecorderRef.current.ondataavailable = e => {
                    if (e.data?.size > 0) patientChunksRef.current.push(e.data)
                }
                patientRecorderRef.current.start(1000)
            } catch (err) {
                console.warn('[Recording] Patient recorder init failed:', err.message)
            }
        }

        // Every 10s — flush current chunks and upload
        chunkIntervalRef.current = setInterval(async () => {
            const doctorBatch = [...doctorChunksRef.current]
            const patientBatch = [...patientChunksRef.current]
            doctorChunksRef.current = []
            patientChunksRef.current = []

            await uploadChunk(doctorBatch, 'doctor')
            if (patientBatch.length) await uploadChunk(patientBatch, 'patient')
        }, 10000)

    }, [uploadChunk, appointmentId, backendUrl, dToken])

    /** Stop recorders, upload final chunks, trigger finalization */
    const stopDualRecording = useCallback(async () => {
        console.log('[Recording] Stopping dual-stream recording')
        clearInterval(chunkIntervalRef.current)

        // Stop MediaRecorders and collect final chunks
        const stopRecorder = (recorder) => new Promise(resolve => {
            if (!recorder || recorder.state === 'inactive') return resolve([])
            recorder.ondataavailable = e => {
                if (e.data?.size > 0) resolve([e.data])
                else resolve([])
            }
            recorder.stop()
        })

        const [finalDoctor, finalPatient] = await Promise.all([
            stopRecorder(doctorRecorderRef.current),
            stopRecorder(patientRecorderRef.current)
        ])

        // Upload final chunks
        if (finalDoctor.length) await uploadChunk([...doctorChunksRef.current, ...finalDoctor], 'doctor')
        if (finalPatient.length) await uploadChunk([...patientChunksRef.current, ...finalPatient], 'patient')
        doctorChunksRef.current = []
        patientChunksRef.current = []

        // Trigger AI finalization
        if (consultationIdRef.current) {
            setRecordingStatus('uploading')
            try {
                console.log('[Recording] Triggering AI finalization for:', consultationIdRef.current)
                await axios.post(
                    `${backendUrl}/api/doctor/consultations/${consultationIdRef.current}/finalize`,
                    {},
                    { headers: { dtoken: dToken } }
                )
                console.log('[Recording] Finalization triggered successfully')
            } catch (err) {
                console.warn('[Recording] Finalization request failed:', err.message)
            }
            setRecordingStatus('idle')
        }
    }, [uploadChunk, backendUrl, dToken])

    // ─── Main call initialization ──────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !profileData?._id || !appointmentId) return

        let cancelled = false

        const initCall = async () => {
            // 1. Request media permissions
            let stream
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: !isAudioOnly,
                    audio: true
                })
            } catch (err) {
                if (cancelled) return
                console.error('[Doctor CallWindow] getUserMedia error:', err.name, err.message)

                let userMessage = 'Could not access camera/microphone.'
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    userMessage = 'Camera/Microphone access was denied. Please allow permissions in your browser and try again.'
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    userMessage = 'No camera or microphone found on this device.'
                } else if (err.name === 'NotReadableError') {
                    userMessage = 'Camera or microphone is already in use by another application.'
                } else if (err.name === 'OverconstrainedError') {
                    if (!isAudioOnly) {
                        try {
                            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                            userMessage = null
                        } catch (_) {
                            userMessage = 'Could not access microphone.'
                        }
                    }
                }

                if (userMessage) {
                    setPermissionError(userMessage)
                    setCallStatus('Error')
                    return
                }
            }

            if (cancelled) {
                stream?.getTracks().forEach(t => t.stop())
                return
            }

            localStreamRef.current = stream
            setLocalStream(stream)

            // 2. Create PeerJS instance
            const peerId = `${profileData._id}-${Date.now()}`
            console.log('[Doctor CallWindow] Creating peer with id:', peerId)

            const peer = new Peer(peerId, {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ]
                }
            })

            peerRef.current = peer

            peer.on('open', (id) => {
                if (cancelled) return
                console.log('[Doctor CallWindow] PeerJS open, id:', id)

                if (isCaller) {
                    socket.emit('call-user', {
                        appointmentId,
                        callerId: profileData._id,
                        callerPeerId: id,
                        callerName: profileData.name,
                        callerImage: profileData.image,
                        callerType: 'doctor',
                        callType: isAudioOnly ? 'audio' : 'video'
                    })
                    console.log('[Doctor CallWindow] Emitted call-user event')
                } else {
                    socket.emit('call-accepted', {
                        appointmentId,
                        accepterId: profileData._id,
                        accepterPeerId: id,
                        accepterName: profileData.name
                    })
                    console.log('[Doctor CallWindow] Emitted call-accepted event (receiver)')
                }
            })

            // 3. Receiver: answer incoming peer calls
            peer.on('call', (incomingCall) => {
                if (cancelled) return
                console.log('[Doctor CallWindow] Receiving peer call, answering...')
                currentCallRef.current = incomingCall
                incomingCall.answer(localStreamRef.current)

                incomingCall.on('stream', (remote) => {
                    if (cancelled) return
                    console.log('[Doctor CallWindow] Got remote stream (receiver)')
                    setRemoteStream(remote)
                    setCallStatus('Connected')
                    startDualRecording(localStreamRef.current, remote)
                })

                incomingCall.on('close', async () => {
                    if (cancelled) return
                    setCallStatus('Call Ended')
                    await stopDualRecording()
                    cleanUp()
                    if (consultationIdRef.current) {
                        navigate(`/doctor-consultation/${consultationIdRef.current}`)
                    } else {
                        onClose()
                    }
                })

                incomingCall.on('error', (err) => {
                    console.error('[Doctor CallWindow] Incoming call error:', err)
                })
            })

            peer.on('error', (err) => {
                if (cancelled) return
                console.error('[Doctor CallWindow] PeerJS error:', err.type, err.message)
                if (err.type === 'peer-unavailable') {
                    setCallStatus('Patient unavailable')
                    setTimeout(onClose, 3000)
                } else if (err.type === 'network' || err.type === 'server-error') {
                    setCallStatus('Connection Failed')
                    setPermissionError('Could not connect to call server. Check your internet connection.')
                    setTimeout(onClose, 3000)
                }
            })

            peer.on('disconnected', () => {
                console.warn('[Doctor CallWindow] PeerJS disconnected, reconnecting...')
                if (!cancelled && peer && !peer.destroyed) {
                    peer.reconnect()
                }
            })
        }

        // ─── Socket signaling handlers ─────────────────────────────────────────
        const handleConsultationCreated = ({ consultationId }) => {
            if (cancelled) return
            consultationIdRef.current = consultationId
            console.log('[Doctor CallWindow] Consultation created/linked:', consultationId)
        }

        const handleCallAccepted = ({ accepterPeerId }) => {
            if (cancelled) return
            console.log('[Doctor CallWindow] call-accepted received, calling peer:', accepterPeerId)
            setCallStatus('Connecting...')

            const targetPeerId = accepterPeerId

            if (peerRef.current && localStreamRef.current && targetPeerId) {
                const call = peerRef.current.call(targetPeerId, localStreamRef.current)
                currentCallRef.current = call

                call.on('stream', (remote) => {
                    if (cancelled) return
                    console.log('[Doctor CallWindow] Got remote stream (caller side)')
                    setRemoteStream(remote)
                    setCallStatus('Connected')
                    startDualRecording(localStreamRef.current, remote)
                })

                call.on('close', async () => {
                    if (cancelled) return
                    setCallStatus('Call Ended')
                    await stopDualRecording()
                    cleanUp()
                    if (consultationIdRef.current) {
                        navigate(`/doctor-consultation/${consultationIdRef.current}`)
                    } else {
                        onClose()
                    }
                })

                call.on('error', (err) => {
                    console.error('[Doctor CallWindow] Outgoing call error:', err)
                })
            }
        }

        const handleCallRejected = () => {
            if (cancelled) return
            setCallStatus('Call Declined')
            setTimeout(onClose, 2000)
        }

        const handleCallEnded = async ({ appointmentId: endedId }) => {
            if (cancelled) return
            if (endedId === appointmentId) {
                setCallStatus('Call Ended')
                await stopDualRecording()
                cleanUp()
                if (consultationIdRef.current) {
                    navigate(`/doctor-consultation/${consultationIdRef.current}`)
                } else {
                    onClose()
                }
            }
        }

        const handleReceiveMessage = (msg) => {
            if (msg.appointmentId === appointmentId) {
                setMessages(prev => {
                    if (prev.find(m => m._id === msg._id)) return prev
                    return [...prev, msg]
                })
            }
        }

        socket.emit('join-room', { appointmentId })

        socket.on('consultation-created', handleConsultationCreated)
        socket.on('call-accepted', handleCallAccepted)
        socket.on('call-rejected', handleCallRejected)
        socket.on('call-ended', handleCallEnded)
        socket.on('receive-message', handleReceiveMessage)

        // Start the call
        initCall()

        return () => {
            cancelled = true
            socket.emit('leave-room', { appointmentId })
            socket.off('consultation-created', handleConsultationCreated)
            socket.off('call-accepted', handleCallAccepted)
            socket.off('call-rejected', handleCallRejected)
            socket.off('call-ended', handleCallEnded)
            socket.off('receive-message', handleReceiveMessage)
            cleanUp()
        }
    }, [appointmentId, isCaller, isAudioOnly, socket, profileData, cleanUp, patientPeerId, onClose, startDualRecording, stopDualRecording, navigate])

    // ─── Controls ──────────────────────────────────────────────────────────────
    const toggleMute = () => {
        const stream = localStreamRef.current
        if (!stream) return
        const audioTrack = stream.getAudioTracks()[0]
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled
            setIsMuted(!audioTrack.enabled)
        }
    }

    const toggleCamera = () => {
        const stream = localStreamRef.current
        if (!stream || isAudioOnly) return
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled
            setIsCameraOff(!videoTrack.enabled)
        }
    }

    const endCall = async () => {
        if (socket) {
            socket.emit('call-ended', { appointmentId, enderId: profileData._id })
        }
        await stopDualRecording()
        cleanUp()
        if (consultationIdRef.current) {
            navigate(`/doctor-consultation/${consultationIdRef.current}`)
        } else {
            onClose()
        }
    }

    const formatDuration = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600)
        const mins = Math.floor((totalSeconds % 3600) / 60)
        const secs = totalSeconds % 60
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // ─── Screen Sharing ───────────────────────────────────────────────────────
    const toggleScreenShare = async () => {
        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
                const screenTrack = screenStream.getVideoTracks()[0]
                screenTrackRef.current = screenTrack

                if (currentCallRef.current && currentCallRef.current.peerConnection) {
                    const senders = currentCallRef.current.peerConnection.getSenders()
                    const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video')
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack)
                    }
                }

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream
                }

                screenTrack.onended = () => {
                    stopScreenShare()
                }

                setIsScreenSharing(true)
            } catch (err) {
                console.error("Screen sharing error:", err)
            }
        } else {
            stopScreenShare()
        }
    }

    const stopScreenShare = () => {
        if (screenTrackRef.current) {
            screenTrackRef.current.stop()
            screenTrackRef.current = null
        }
        const localVideoTrack = localStreamRef.current?.getVideoTracks()[0]
        if (localVideoTrack && currentCallRef.current && currentCallRef.current.peerConnection) {
            const senders = currentCallRef.current.peerConnection.getSenders()
            const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video')
            if (videoSender) {
                videoSender.replaceTrack(localVideoTrack)
            }
        }
        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current
        }
        setIsScreenSharing(false)
    }

    // ─── Fullscreen Mode ─────────────────────────────────────────────────────
    const toggleFullScreen = () => {
        const container = document.querySelector('.call-media-block')
        if (!container) return
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error(`Fullscreen enable error: ${err.message}`)
            })
        } else {
            document.exitFullscreen()
        }
    }

    // ─── Collapsible Chat Methods ─────────────────────────────────────────────
    const sendChatMessage = () => {
        const trimmed = chatInput.trim()
        if (!trimmed || !socket) return

        socket.emit('send-message', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor',
            message: trimmed
        })
        setChatInput('')
    }

    const handleAttachFileClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''

        if (file.size > 10 * 1024 * 1024) {
            toast.error('File is too large. Maximum size is 10 MB.')
            return
        }

        setUploadingFile(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('appointmentId', appointmentId)
            formData.append('senderId', profileData._id)
            formData.append('senderType', 'doctor')

            const { data } = await axios.post(
                `${backendUrl}/api/chat/doctor/upload`,
                formData,
                { headers: { dtoken: dToken, 'Content-Type': 'multipart/form-data' } }
            )

            if (!data.success) {
                toast.error(data.message || 'Failed to send file.')
            }
        } catch (error) {
            console.error('[Call Chat] Upload error:', error)
            toast.error('Failed to send file.')
        } finally {
            setUploadingFile(false)
        }
    }

    const formatMsgTime = (dateStr) => {
        const date = new Date(dateStr)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="call-overlay">
            {/* Top Professional Call Header */}
            <div className="call-header-premium">
                <div className="call-header-left">
                    <div className="call-header-avatar-container">
                        <img src={patientImage} alt={patientName} className="call-header-avatar-img" />
                        <span className={`online-indicator-dot ${isPatientOnline ? 'online' : 'offline'}`} title={isPatientOnline ? 'Online' : 'Offline'}></span>
                    </div>
                    <div className="call-header-user-details">
                        <h2 className="call-header-username">{patientName}</h2>
                        <div className="call-header-meta">
                            <span className="call-header-badge">Patient</span>
                        </div>
                    </div>
                </div>

                <div className="call-header-center">
                    <div className="call-header-status-block">
                        <span className={`status-pulse-circle ${callStatus === 'Connected' ? 'connected' : 'ringing'}`}></span>
                        <span className="call-header-status-text">{callStatus}</span>
                    </div>
                </div>

                <div className="call-header-right">
                    <div className="call-header-timer-block">
                        <svg className="timer-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span className="call-header-timer">{formatDuration(callDuration)}</span>
                    </div>
                </div>
            </div>

            {/* Main call body (Video Block & Collapsible Chat Sidebar) */}
            <div className="call-body-layout">
                {/* Media streams container */}
                <div className="call-media-block">
                    {/* Ringing/connecting screen */}
                    {callStatus !== 'Connected' && (
                        <div className="call-info">
                            <div className={`call-avatar-wrapper ${callStatus === 'Ringing...' ? 'ringing' : ''}`}>
                                <img src={patientImage} alt={patientName} className="call-avatar" />
                            </div>
                            <h3 className="call-name">{patientName}</h3>
                            <div className="call-type-badge">
                                <img src={isAudioOnly ? assets.call_icon : assets.video_icon} alt="" style={{ width: '16px', height: '16px', marginRight: '6px', filter: 'brightness(0) invert(1)' }} />
                                {isAudioOnly ? 'Audio Call' : 'Video Call'}
                            </div>
                            <p className="call-status">
                                {permissionError || callStatus}
                                {callStatus === 'Ringing...' && (
                                    <>
                                        <span className="status-dot"></span>
                                        <span className="status-dot"></span>
                                        <span className="status-dot"></span>
                                    </>
                                )}
                            </p>
                            {permissionError && (
                                <p className="permission-error-text">
                                    {permissionError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Video Streams */}
                    {callStatus === 'Connected' && (
                        <div className="call-video-container">
                            {!isAudioOnly && remoteStream ? (
                                <video
                                    ref={remoteVideoRef}
                                    className="call-remote-video"
                                    autoPlay
                                    playsInline
                                />
                            ) : (
                                <div className="call-no-video">
                                    <div className="icon">
                                        <img src={assets.call_icon} alt="" style={{ width: '48px', height: '48px', filter: 'brightness(0) invert(1)', opacity: 0.7 }} />
                                    </div>
                                    <p>{patientName}</p>
                                </div>
                            )}

                            {!isAudioOnly && localStream && !isCameraOff && (
                                <video
                                    ref={localVideoRef}
                                    className="call-local-video"
                                    autoPlay
                                    playsInline
                                    muted
                                />
                            )}

                            {/* Dual stream recording indicators */}
                            {recordingStatus === 'recording' && (
                                <div className="recording-indicator-badge">
                                    <span className="recording-pulse-dot"></span>
                                    REC
                                </div>
                            )}

                            {recordingStatus === 'uploading' && (
                                <div className="recording-processing-badge">
                                    Processing...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Collapsible Chat Sidebar */}
                {chatOpen && (
                    <div className="call-chat-sidebar">
                        <div className="call-chat-sidebar-header">
                            <h3>Consultation Chat</h3>
                            <button className="call-chat-close-btn" onClick={() => setChatOpen(false)}>✕</button>
                        </div>

                        <div className="call-chat-messages-container">
                            {messages.map((msg, idx) => (
                                <div key={msg._id || idx} className={`call-chat-msg ${msg.senderType === 'doctor' ? 'sent' : 'received'}`}>
                                    {msg.fileUrl ? (
                                        <div className="chat-file-attachment">
                                            {/\.(jpg|jpeg|png|gif|webp)$/i.test(msg.fileUrl) ? (
                                                <img src={msg.fileUrl} alt="attachment" className="chat-img-preview" />
                                            ) : (
                                                <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="chat-file-link">
                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                                                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                                    </svg>
                                                    {msg.fileName || 'Attachment'}
                                                </a>
                                            )}
                                        </div>
                                    ) : null}
                                    {msg.message && <p className="chat-msg-text">{msg.message}</p>}
                                    <span className="chat-msg-time">{formatMsgTime(msg.createdAt)}</span>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="call-chat-input-area">
                            <input
                                ref={fileInputRef}
                                type="file"
                                style={{ display: 'none' }}
                                onChange={handleFileSelected}
                            />
                            <button className="call-chat-attach-btn" onClick={handleAttachFileClick} disabled={uploadingFile}>
                                {uploadingFile ? '..' : '+'}
                            </button>
                            <input
                                type="text"
                                className="call-chat-input-box"
                                placeholder="Type a message..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                            />
                            <button className="call-chat-send-btn" onClick={sendChatMessage}>
                                Send
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="call-controls">
                {/* Mute button */}
                <button
                    className={`call-control-btn mute ${isMuted ? 'active' : ''}`}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                >
                    <img src={isMuted ? assets.mic_off : assets.mic_on} alt={isMuted ? 'Unmute' : 'Mute'} style={{ width: '22px', height: '22px' }} />
                </button>

                {/* Camera toggle (video calls only) */}
                {!isAudioOnly && (
                    <button
                        className={`call-control-btn camera ${isCameraOff ? 'active' : ''}`}
                        onClick={toggleCamera}
                        title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                    >
                        <img src={isCameraOff ? assets.video_off : assets.video_icon} alt={isCameraOff ? 'Camera Off' : 'Camera On'} style={{ width: '22px', height: '22px' }} />
                    </button>
                )}

                {/* Screen Sharing (video calls only) */}
                {!isAudioOnly && callStatus === 'Connected' && (
                    <button
                        className={`call-control-btn screen-share ${isScreenSharing ? 'active' : ''}`}
                        onClick={toggleScreenShare}
                        title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                        style={{ background: isScreenSharing ? '#34d399' : 'rgba(255, 255, 255, 0.15)' }}
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                    </button>
                )}

                {/* Full screen toggle */}
                {callStatus === 'Connected' && (
                    <button
                        className="call-control-btn fullscreen-toggle"
                        onClick={toggleFullScreen}
                        title="Toggle Fullscreen"
                        style={{ background: 'rgba(255, 255, 255, 0.15)' }}
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                    </button>
                )}

                {/* Collapsible Chat toggle */}
                <button
                    className={`call-control-btn chat-toggle ${chatOpen ? 'active' : ''}`}
                    onClick={() => setChatOpen(!chatOpen)}
                    title="Toggle Chat"
                    style={{ background: chatOpen ? '#4f46e5' : 'rgba(255, 255, 255, 0.15)' }}
                >
                    <img src={assets.message_icon} alt="Chat" style={{ width: '22px', height: '22px', filter: 'brightness(0) invert(1)' }} />
                </button>

                {/* End call button */}
                <button
                    className="call-control-btn end-call"
                    onClick={endCall}
                    title="End Call"
                >
                    <img src={assets.end_call} alt="End Call" style={{ width: '22px', height: '22px' }} />
                </button>
            </div>
        </div>
    )
}

export default CallWindow
