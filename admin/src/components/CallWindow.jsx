import React, { useState, useEffect, useRef, useContext } from 'react'
import { DoctorContext } from '../context/DoctorContext'
import { SocketContext } from '../context/SocketContext'
import Peer from 'peerjs'
import './CallWindow.css'

const CallWindow = ({ appointment, isCaller, onClose }) => {
    const { profileData } = useContext(DoctorContext)
    const { socket } = useContext(SocketContext)

    const [callStatus, setCallStatus] = useState(isCaller ? 'Ringing...' : 'Connecting...')
    const [localStream, setLocalStream] = useState(null)
    const [remoteStream, setRemoteStream] = useState(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isCameraOff, setIsCameraOff] = useState(false)
    const [callDuration, setCallDuration] = useState(0)
    const [isAudioOnly, setIsAudioOnly] = useState(false)

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const peerRef = useRef(null)
    const currentCallRef = useRef(null)
    const timerIntervalRef = useRef(null)

    const patientName = appointment.userData.name
    const patientImage = appointment.userData.image
    const appointmentId = appointment._id

    // Clean up streams and peer connection
    const cleanUp = () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop())
        }
        if (currentCallRef.current) {
            currentCallRef.current.close()
        }
        if (peerRef.current) {
            peerRef.current.destroy()
        }
        setLocalStream(null)
        setRemoteStream(null)
    }

    // Timer for call duration
    useEffect(() => {
        if (callStatus === 'Connected') {
            timerIntervalRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1)
            }, 1000)
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current)
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        }
    }, [callStatus])

    useEffect(() => {
        let streamInstance = null

        // Initialize Peer and Get Media
        const initCall = async () => {
            try {
                // Request camera & microphone permissions
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: !isAudioOnly,
                    audio: true
                })
                setLocalStream(stream)
                streamInstance = stream

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream
                }

                // Create Peer instance with doctor ID
                const peer = new Peer(profileData._id, {
                    host: '/',
                    port: '',
                    path: '',
                    secure: true,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    }
                })

                peerRef.current = peer

                peer.on('open', (id) => {
                    console.log('Doctor PeerJS connected with ID:', id)
                    if (isCaller) {
                        // If caller, send signal to patient
                        socket.emit('call-user', {
                            appointmentId,
                            callerId: profileData._id,
                            callerName: profileData.name,
                            callerImage: profileData.image,
                            callerType: 'doctor',
                            callType: isAudioOnly ? 'audio' : 'video'
                        })
                    } else {
                        // If receiver (already accepted), signal patient that we are ready
                        socket.emit('call-accepted', {
                            appointmentId,
                            accepterId: profileData._id,
                            accepterName: profileData.name
                        })
                    }
                })

                // Listen for incoming calls (receiver side)
                peer.on('call', (incomingCall) => {
                    console.log('Receiving call from PeerJS...')
                    currentCallRef.current = incomingCall
                    incomingCall.answer(stream)

                    incomingCall.on('stream', (remoteStream) => {
                        console.log('Received remote stream')
                        setRemoteStream(remoteStream)
                        setCallStatus('Connected')
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = remoteStream
                        }
                    })

                    incomingCall.on('close', () => {
                        setCallStatus('Call Ended')
                        setTimeout(onClose, 2000)
                    })
                })

                peer.on('error', (err) => {
                    console.error('PeerJS error:', err)
                    if (err.type === 'peer-unavailable') {
                        setCallStatus('Patient unavailable')
                        setTimeout(onClose, 2000)
                    }
                })

            } catch (err) {
                console.error('Failed to get local stream or init PeerJS:', err)
                setCallStatus('Permission Denied')
                setTimeout(onClose, 2000)
            }
        }

        initCall()

        // Socket.IO Call Status Handlers
        const handleCallAccepted = () => {
            console.log('Call accepted by patient, initiating PeerJS call')
            setCallStatus('Connecting...')
            if (peerRef.current && streamInstance) {
                // Call the patient (patient's peer ID is their userId)
                const call = peerRef.current.call(appointment.userId, streamInstance)
                currentCallRef.current = call

                call.on('stream', (remoteStream) => {
                    console.log('Received remote stream (caller side)')
                    setRemoteStream(remoteStream)
                    setCallStatus('Connected')
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream
                    }
                })

                call.on('close', () => {
                    setCallStatus('Call Ended')
                    setTimeout(onClose, 2000)
                })
            }
        }

        const handleCallRejected = () => {
            setCallStatus('Call Declined')
            setTimeout(onClose, 2000)
        }

        const handleCallEnded = () => {
            setCallStatus('Call Ended')
            cleanUp()
            setTimeout(onClose, 2000)
        }

        socket.on('call-accepted', handleCallAccepted)
        socket.on('call-rejected', handleCallRejected)
        socket.on('call-ended', handleCallEnded)

        return () => {
            socket.off('call-accepted', handleCallAccepted)
            socket.off('call-rejected', handleCallRejected)
            socket.off('call-ended', handleCallEnded)
            if (streamInstance) {
                streamInstance.getTracks().forEach(track => track.stop())
            }
            if (peerRef.current) {
                peerRef.current.destroy()
            }
        }
    }, [appointmentId, isCaller, socket, isAudioOnly])

    // Handle Mute Toggle
    const toggleMute = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0]
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled
                setIsMuted(!audioTrack.enabled)
            }
        }
    }

    // Handle Camera Toggle
    const toggleCamera = () => {
        if (localStream && !isAudioOnly) {
            const videoTrack = localStream.getVideoTracks()[0]
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled
                setIsCameraOff(!videoTrack.enabled)
            }
        }
    }

    // End the call
    const endCall = () => {
        socket.emit('call-ended', { appointmentId, enderId: profileData._id })
        setCallStatus('Call Ended')
        cleanUp()
        onClose()
    }

    // Format call duration to MM:SS
    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="call-overlay">
            <div className="call-container">
                {/* Caller / Patient Profile Info */}
                {callStatus !== 'Connected' && (
                    <div className="call-info">
                        <div className={`call-avatar-wrapper ${callStatus === 'Ringing...' ? 'ringing' : ''}`}>
                            <img src={patientImage} alt={patientName} className="call-avatar" />
                        </div>
                        <h3 className="call-name">{patientName}</h3>
                        <div className="call-type-badge">
                            {isAudioOnly ? '📞 Audio Call' : '📹 Video Call'}
                        </div>
                        <p className="call-status">
                            {callStatus}
                            {callStatus === 'Ringing...' && (
                                <>
                                    <span className="status-dot"></span>
                                    <span className="status-dot"></span>
                                    <span className="status-dot"></span>
                                </>
                            )}
                        </p>
                    </div>
                )}

                {/* Video Streams Container */}
                {callStatus === 'Connected' && (
                    <div className="call-video-container">
                        {/* Remote Video (Patient) */}
                        {!isAudioOnly && remoteStream ? (
                            <video
                                ref={remoteVideoRef}
                                className="call-remote-video"
                                autoPlay
                                playsInline
                            />
                        ) : (
                            <div className="call-no-video">
                                <div className="icon">👤</div>
                                <p>{patientName}</p>
                                <span className="call-timer">{formatDuration(callDuration)}</span>
                            </div>
                        )}

                        {/* Local Video (Doctor - PiP style) */}
                        {!isAudioOnly && localStream && !isCameraOff && (
                            <video
                                ref={localVideoRef}
                                className="call-local-video"
                                autoPlay
                                playsInline
                                muted
                            />
                        )}

                        {/* Connection Timer for Video Call */}
                        {!isAudioOnly && (
                            <div style={{
                                position: 'absolute',
                                top: '16px',
                                left: '16px',
                                background: 'rgba(0, 0, 0, 0.6)',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                color: 'white',
                                fontSize: '13px',
                                zIndex: 10
                            }}>
                                {formatDuration(callDuration)}
                            </div>
                        )}
                    </div>
                )}

                {/* Call Control Buttons */}
                <div className="call-controls">
                    <button
                        className={`call-control-btn mute ${isMuted ? 'active' : ''}`}
                        onClick={toggleMute}
                        title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                        {isMuted ? '🎙️' : '🎤'}
                    </button>

                    <button
                        className="call-control-btn end-call"
                        onClick={endCall}
                        title="End Call"
                    >
                        📴
                    </button>

                    {!isAudioOnly && (
                        <button
                            className={`call-control-btn camera ${isCameraOff ? 'active' : ''}`}
                            onClick={toggleCamera}
                            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
                        >
                            {isCameraOff ? '📷' : '📹'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default CallWindow
