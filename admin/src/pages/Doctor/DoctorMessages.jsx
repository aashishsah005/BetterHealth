import React, { useContext, useEffect, useState, useRef } from 'react'
import { DoctorContext } from '../../context/DoctorContext'
import { SocketContext } from '../../context/SocketContext'
import axios from 'axios'
import './DoctorMessages.css'

const DoctorMessages = () => {
    const { backendUrl, dToken, appointments, getAppointments, profileData } = useContext(DoctorContext)
    const { socket } = useContext(SocketContext)

    const [selectedAppt, setSelectedAppt] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [loading, setLoading] = useState(false)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    // Load appointments on load
    useEffect(() => {
        if (dToken) {
            getAppointments()
        }
    }, [dToken])

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

    // Filter by search query
    const filteredPatients = uniquePatients.filter(appt =>
        appt.userData.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Load chat history when selected appointment changes
    useEffect(() => {
        if (!selectedAppt) return

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
    }, [selectedAppt, backendUrl, dToken])

    // Socket.IO event listeners for selected chat room
    useEffect(() => {
        if (!socket || !selectedAppt) return

        const appointmentId = selectedAppt._id

        // Join room
        socket.emit('join-room', { appointmentId })

        // Listen for incoming messages
        const handleReceiveMessage = (msg) => {
            if (msg.appointmentId === appointmentId) {
                setMessages(prev => {
                    // Check for duplicates
                    if (prev.find(m => m._id === msg._id)) return prev
                    return [...prev, msg]
                })
            }
        }

        // Listen for typing indicator
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

        socket.on('receive-message', handleReceiveMessage)
        socket.on('user-typing', handleTyping)
        socket.on('user-stop-typing', handleStopTyping)

        return () => {
            socket.emit('leave-room', { appointmentId })
            socket.off('receive-message', handleReceiveMessage)
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
    const handleSend = () => {
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
    }

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

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

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
                            <span className="search-icon">🔍</span>
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
                            </div>

                            {/* Messages Container */}
                            <div className="pane-messages">
                                {loading ? (
                                    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                                        Loading messages...
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                                        <span style={{ fontSize: '32px' }}>💬</span>
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
                                            <div
                                                className={`bubble ${msg.senderType === 'doctor' ? 'sent' : 'received'}`}
                                            >
                                                {msg.message}
                                                <span className="bubble-time">
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                            </div>
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
                            <div className="pane-input-area">
                                <textarea
                                    ref={inputRef}
                                    className="pane-input"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                />
                                <button
                                    className="pane-send-btn"
                                    onClick={handleSend}
                                    disabled={!newMessage.trim()}
                                >
                                    ➤
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="chat-pane-empty">
                            <span className="empty-icon">💬</span>
                            <p>Select a patient to start messaging</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default DoctorMessages
