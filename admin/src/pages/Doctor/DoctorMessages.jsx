import React, { useContext, useEffect, useState, useRef, useCallback } from 'react'
import { DoctorContext } from '../../context/DoctorContext'
import { SocketContext } from '../../context/SocketContext'
import { assets } from '../../assets/assets'
import CallWindow from '../../components/CallWindow'
import axios from 'axios'
import { toast } from 'react-toastify'
import './DoctorMessages.css'

const DoctorMessages = () => {
    const { backendUrl, dToken, appointments, getAppointments, profileData, selectedAppt, setSelectedAppt, unreadCounts, setUnreadCounts } = useContext(DoctorContext)
    const { socket } = useContext(SocketContext)

    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [loading, setLoading] = useState(false)
    const [lastActiveTimes, setLastActiveTimes] = useState({})
    const [uploadingFile, setUploadingFile] = useState(false)

    // Call states
    const [showCall, setShowCall] = useState(null)
    const [isCallCaller, setIsCallCaller] = useState(false)
    const [callIsAudioOnly, setCallIsAudioOnly] = useState(false)
    const [incomingCallData, setIncomingCallData] = useState(null)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const fileInputRef = useRef(null)

    // Load appointments on load
    useEffect(() => {
        if (dToken) {
            getAppointments()
        }
    }, [dToken])

    // Initialize/sync last active times by patient userId
    useEffect(() => {
        if (appointments.length > 0) {
            const initialTimes = {}
            appointments.forEach((appt, index) => {
                if (appt.userData) {
                    initialTimes[appt.userId] = index
                }
            })
            setLastActiveTimes(prev => ({ ...initialTimes, ...prev }))
        }
    }, [appointments])

    // Group appointments by unique patient (userId) using the latest appointment
    const sortedAppointments = [...appointments].reverse()
    const uniquePatients = []
    const seenPatients = new Set()

    sortedAppointments.forEach(appt => {
        if (!appt.userData) return
        if (!seenPatients.has(appt.userId)) {
            seenPatients.add(appt.userId)
            uniquePatients.push(appt)
        }
    })

    // Sort uniquePatients based on last active times
    const getActiveTime = (userId) => lastActiveTimes[userId] || 0
    const sortedPatients = [...uniquePatients].sort((a, b) => {
        return getActiveTime(b.userId) - getActiveTime(a.userId)
    })

    // Filter by search query
    const filteredPatients = sortedPatients.filter(appt =>
        appt.userData.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Load chat history when selected appointment changes
    useEffect(() => {
        if (!selectedAppt) return

        // Reset unread count for this selected chat in context
        setUnreadCounts(prev => ({
            ...prev,
            [selectedAppt._id]: 0
        }))

        const fetchMessages = async () => {
            setLoading(true)
            try {
                const { data } = await axios.get(
                    `${backendUrl}/api/chat/doctor/messages/${selectedAppt._id}`,
                    { headers: { dtoken: dToken } }
                )
                if (data.success) {
                    setMessages(data.messages)
                }
            } catch (error) {
                console.log('Error fetching messages:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchMessages()
        setNewMessage('')
    }, [selectedAppt, backendUrl, dToken, setUnreadCounts])

    // Global Socket.IO listener for incoming messages to manage sidebar ordering and chat appends
    useEffect(() => {
        if (!socket) return

        const handleReceiveMessage = (msg) => {
            // Find corresponding appointment to get patient's userId
            const appt = appointments.find(a => a._id === msg.appointmentId)
            if (!appt) return

            // Update last active time for this patient to bubble them to the top
            setLastActiveTimes(prev => ({
                ...prev,
                [appt.userId]: Date.now()
            }))

            // If the message is for the currently selected chat room, append it
            if (selectedAppt && msg.appointmentId === selectedAppt._id) {
                setMessages(prev => {
                    if (prev.find(m => m._id === msg._id)) return prev
                    return [...prev, msg]
                })
            }
        }

        socket.on('receive-message', handleReceiveMessage)

        // Incoming call listeners
        const handleIncomingCall = (callData) => {
            console.log('Doctor messages incoming call event received:', callData)
            const appt = appointments.find(a => a._id === callData.appointmentId)
            if (appt) {
                setIncomingCallData({
                    appointment: appt,
                    callerName: callData.callerName,
                    callerImage: callData.callerImage,
                    callType: callData.callType
                })
            }
        }

        const handleCallEndedGlobal = ({ appointmentId }) => {
            setIncomingCallData(prev => {
                if (prev && prev.appointment._id === appointmentId) {
                    toast.info("Call missed/ended")
                    return null
                }
                return prev
            })
        }

        socket.on('incoming-call', handleIncomingCall)
        socket.on('call-ended', handleCallEndedGlobal)

        return () => {
            socket.off('receive-message', handleReceiveMessage)
            socket.off('incoming-call', handleIncomingCall)
            socket.off('call-ended', handleCallEndedGlobal)
        }
    }, [socket, selectedAppt, appointments])

    // Specific Socket.IO listeners for typing indicator of selected chat
    useEffect(() => {
        if (!socket || !selectedAppt) return

        const handleTyping = ({ senderType }) => {
            if (senderType === 'user') {
                setIsTyping(true)
            }
        }

        const handleStopTyping = ({ senderType }) => {
            if (senderType === 'user') {
                setIsTyping(false)
            }
        }

        socket.on('user-typing', handleTyping)
        socket.on('user-stop-typing', handleStopTyping)

        return () => {
            socket.off('user-typing', handleTyping)
            socket.off('user-stop-typing', handleStopTyping)
            setIsTyping(false)
        }
    }, [socket, selectedAppt])

    // Scroll to bottom on message list update or typing indicator change
    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    // Focus input on select
    useEffect(() => {
        if (selectedAppt && !loading) {
            inputRef.current?.focus()
        }
    }, [selectedAppt, loading])

    // Handle sending a message
    const handleSend = useCallback(() => {
        const trimmed = newMessage.trim()
        if (!trimmed || !socket || !selectedAppt || !profileData) return

        socket.emit('send-message', {
            appointmentId: selectedAppt._id,
            senderId: profileData._id,
            senderType: 'doctor',
            message: trimmed
        })

        socket.emit('stop-typing', {
            appointmentId: selectedAppt._id,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        setNewMessage('')
        inputRef.current?.focus()
    }, [newMessage, socket, selectedAppt, profileData])

    // Typing behavior
    const handleInputChange = (e) => {
        setNewMessage(e.target.value)

        if (!socket || !selectedAppt || !profileData) return

        socket.emit('typing', {
            appointmentId: selectedAppt._id,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop-typing', {
                appointmentId: selectedAppt._id,
                senderId: profileData._id,
                senderType: 'doctor'
            })
        }, 2000)
    }

    // Attachment triggers
    const handleAttachClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0]
        if (!file || !selectedAppt) return

        e.target.value = ''

        if (file.size > 10 * 1024 * 1024) {
            toast.error('File too large (max 10MB)')
            return
        }

        setUploadingFile(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('appointmentId', selectedAppt._id)
            formData.append('senderId', profileData._id)
            formData.append('senderType', 'doctor')

            const { data } = await axios.post(
                `${backendUrl}/api/chat/doctor/upload`,
                formData,
                {
                    headers: {
                        dtoken: dToken,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            )

            if (data.success) {
                toast.success('File sent successfully')
            } else {
                toast.error(data.message || 'Upload failed')
            }
        } catch (err) {
            console.error('File upload error:', err)
            toast.error('Error sending file')
        } finally {
            setUploadingFile(false)
        }
    }

    // Call handlers
    const handleStartCall = ({ appointment, isAudioOnly }) => {
        setShowCall(appointment)
        setIsCallCaller(true)
        setCallIsAudioOnly(isAudioOnly)
    }

    const acceptCall = () => {
        if (incomingCallData) {
            setShowCall(incomingCallData.appointment)
            setIsCallCaller(false)
            setCallIsAudioOnly(incomingCallData.callType === 'audio')
            setIncomingCallData(null)
        }
    }

    const rejectCall = () => {
        if (incomingCallData && socket && profileData) {
            socket.emit('call-rejected', {
                appointmentId: incomingCallData.appointment._id,
                rejecterId: profileData._id
            })
            setIncomingCallData(null)
        }
    }

    const isImageFile = (url) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)

    // Date/Time utilities
    const formatTime = (dateStr) => {
        const date = new Date(dateStr)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const formatDate = (dateStr) => {
        const date = new Date(dateStr)
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        if (date.toDateString() === today.toDateString()) return 'Today'
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const shouldShowDate = (index) => {
        if (index === 0) return true
        const curr = new Date(messages[index].createdAt).toDateString()
        const prev = new Date(messages[index - 1].createdAt).toDateString()
        return curr !== prev
    }

    return (
        <div className="w-full flex justify-center">
            <div className="messages-page-container w-full max-w-6xl">
                {/* Left Side: Sidebar list of patient conversations */}
                <div className="patients-sidebar">
                    <div className="sidebar-header">
                        <h2>Conversations</h2>
                        <div className="search-container">
                            <span className="search-icon">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            </span>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search patients..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="patients-list">
                        {filteredPatients.length === 0 ? (
                            <div className="text-center text-sm text-gray-400 mt-8 px-4">
                                No patients found
                            </div>
                        ) : (
                            filteredPatients.map((appt) => (
                                <div
                                    key={appt._id}
                                    className={`patient-item ${selectedAppt?._id === appt._id ? 'active' : ''}`}
                                    onClick={() => setSelectedAppt(appt)}
                                >
                                    <div className="patient-avatar-container">
                                        <img
                                            src={appt.userData.image}
                                            alt={appt.userData.name}
                                            className="patient-avatar"
                                        />
                                    </div>
                                    <div className="patient-info">
                                        <div className="patient-name">{appt.userData.name}</div>
                                        <div className="appt-detail-text">
                                            Latest Appt: {appt.slotDate} ({appt.slotTime})
                                        </div>
                                    </div>
                                    {unreadCounts[appt._id] > 0 && (
                                        <div className="unread-badge-sidebar">
                                            {unreadCounts[appt._id]}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Side: Chat Box */}
                <div className="chat-pane">
                    {selectedAppt ? (
                        <>
                            {/* Chat Header */}
                            <div className="pane-header">
                                <div className="pane-header-info">
                                    <img
                                        src={selectedAppt.userData.image}
                                        alt={selectedAppt.userData.name}
                                        className="pane-avatar"
                                    />
                                    <div>
                                        <div className="pane-name">{selectedAppt.userData.name}</div>
                                        <div className="pane-status">
                                            {isTyping ? (
                                                <span className="typing-text">Typing...</span>
                                            ) : (
                                                <>
                                                    <span className="status-dot"></span>
                                                    Active Session
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="pane-header-actions flex gap-2">
                                    <button
                                        onClick={() => handleStartCall({ appointment: selectedAppt, isAudioOnly: true })}
                                        className="p-2 hover:bg-gray-100 rounded-full text-zinc-600 transition-colors"
                                        title="Audio Call"
                                    >
                                        <img src={assets.call_icon} alt="Audio Call" style={{ width: '20px', height: '20px' }} />
                                    </button>
                                    <button
                                        onClick={() => handleStartCall({ appointment: selectedAppt, isAudioOnly: false })}
                                        className="p-2 hover:bg-gray-100 rounded-full text-zinc-600 transition-colors"
                                        title="Video Call"
                                    >
                                        <img src={assets.video_icon} alt="Video Call" style={{ width: '20px', height: '20px' }} />
                                    </button>
                                </div>
                            </div>

                            {/* Messages Container */}
                            <div className="pane-messages">
                                {loading ? (
                                    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                                        Loading messages...
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                                        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        <p className="text-sm">Start the conversation with {selectedAppt.userData.name}</p>
                                    </div>
                                ) : (
                                    messages.map((msg, index) => (
                                        <React.Fragment key={msg._id || index}>
                                            {shouldShowDate(index) && (
                                                <div className="date-badge">
                                                    <span>{formatDate(msg.createdAt)}</span>
                                                </div>
                                            )}
                                            {/* Call log messages */}
                                            {msg.type === 'call' ? (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    gap: '6px', margin: '6px auto', padding: '5px 14px',
                                                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
                                                    borderRadius: '20px', maxWidth: '85%', width: 'fit-content'
                                                }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', color: '#6366f1' }}>
                                                        {msg.callType === 'video' ? (
                                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                                        ) : (
                                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 500 }}>{msg.message}</span>
                                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>{formatTime(msg.createdAt)}</span>
                                                </div>
                                            ) : (
                                            <div
                                                className={`bubble ${msg.senderType === 'doctor' ? 'sent' : 'received'}`}
                                            >
                                                {msg.fileUrl ? (
                                                    isImageFile(msg.fileUrl) ? (
                                                        <img
                                                            src={msg.fileUrl}
                                                            alt="attachment"
                                                            style={{ maxWidth: '200px', borderRadius: '8px', display: 'block', marginBottom: '4px' }}
                                                        />
                                                    ) : (
                                                        <a
                                                            href={msg.fileUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{ color: 'inherit', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}
                                                        >
                                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                                            {msg.fileName || 'Attachment'}
                                                        </a>
                                                    )
                                                ) : null}
                                                {msg.message && <span>{msg.message}</span>}
                                                <span className="bubble-time">
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                            </div>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}

                                {isTyping && (
                                    <div className="pane-typing-indicator">
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input Area */}
                            <div className="pane-input-area flex items-center gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept="image/*,.pdf,.doc,.docx,.txt"
                                    onChange={handleFileSelected}
                                />
                                <button
                                    onClick={handleAttachClick}
                                    disabled={uploadingFile}
                                    className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 disabled:opacity-50"
                                    title="Attach file"
                                >
                                    {uploadingFile ? (
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M12 6v6l4 2"></path>
                                        </svg>
                                    ) : (
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                        </svg>
                                    )}
                                </button>
                                <textarea
                                    ref={inputRef}
                                    className="pane-input flex-1"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={handleInputChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSend()
                                        }
                                    }}
                                    rows={1}
                                />
                                <button
                                    className="pane-send-btn"
                                    onClick={handleSend}
                                    disabled={!newMessage.trim() || uploadingFile}
                                >
                                    <img src={assets.send_icon} alt="Send" style={{ width: '18px', height: '18px', filter: 'brightness(0) invert(1)' }} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="chat-pane-empty">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-icon" style={{ opacity: 0.3 }}>
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <p>Select a patient to start messaging</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Call Overlay */}
            {showCall && (
                <CallWindow
                    appointment={showCall}
                    isCaller={isCallCaller}
                    isAudioOnly={callIsAudioOnly}
                    onClose={() => { setShowCall(null); setCallIsAudioOnly(false); }}
                />
            )}

            {/* Global Incoming Call Banner / Modal for Doctor */}
            {incomingCallData && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-4 border border-zinc-100 text-center">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-indigo-500 animate-pulse">
                                <img
                                    src={incomingCallData.callerImage}
                                    alt={incomingCallData.callerName}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <span className="absolute bottom-0 right-0 block h-4 w-4 rounded-full ring-2 ring-white bg-green-400"></span>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-zinc-800">{incomingCallData.callerName}</h3>
                            <p className="text-sm text-zinc-500 mt-1">Patient Calling...</p>
                        </div>
                        <div className="flex gap-4 w-full mt-2 justify-center">
                            <button
                                onClick={rejectCall}
                                className="px-6 py-2.5 bg-red-500 text-white rounded-full font-medium shadow-md hover:bg-red-600 transition-all hover:scale-105 active:scale-95"
                            >
                                Decline
                            </button>
                            <button
                                onClick={acceptCall}
                                className="px-6 py-2.5 bg-green-500 text-white rounded-full font-medium shadow-md hover:bg-green-600 transition-all hover:scale-105 active:scale-95"
                            >
                                Accept
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default DoctorMessages
