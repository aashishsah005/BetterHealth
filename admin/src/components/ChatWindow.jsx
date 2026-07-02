import React, { useState, useEffect, useRef, useContext } from 'react'
import { DoctorContext } from '../context/DoctorContext'
import { SocketContext } from '../context/SocketContext'
import axios from 'axios'
import './ChatWindow.css'

const ChatWindow = ({ appointment, onClose }) => {
    const { backendUrl, dToken, profileData } = useContext(DoctorContext)
    const { socket } = useContext(SocketContext)

    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [loading, setLoading] = useState(true)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    const patientName = appointment.userData.name
    const patientImage = appointment.userData.image
    const appointmentId = appointment._id

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Load chat history
    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const { data } = await axios.get(
                    `${backendUrl}/api/chat/doctor/messages/${appointmentId}`,
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
    }, [appointmentId, backendUrl, dToken])

    // Socket.IO event listeners
    useEffect(() => {
        if (!socket) return

        // Join the appointment room
        socket.emit('join-room', { appointmentId })

        // Listen for new messages
        const handleReceiveMessage = (msg) => {
            if (msg.appointmentId === appointmentId) {
                setMessages(prev => {
                    // Avoid duplicate messages
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
        }
    }, [socket, appointmentId])

    // Auto-scroll on new messages
    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [loading])

    // Handle sending message
    const handleSend = () => {
        const trimmed = newMessage.trim()
        if (!trimmed || !socket) return

        socket.emit('send-message', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor',
            message: trimmed
        })

        // Stop typing indicator
        socket.emit('stop-typing', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        setNewMessage('')
        inputRef.current?.focus()
    }

    // Handle typing indicator
    const handleInputChange = (e) => {
        setNewMessage(e.target.value)

        if (!socket) return

        socket.emit('typing', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        // Clear previous timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        // Stop typing after 2 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop-typing', {
                appointmentId,
                senderId: profileData._id,
                senderType: 'doctor'
            })
        }, 2000)
    }

    // Handle Enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Format time
    const formatTime = (dateStr) => {
        const date = new Date(dateStr)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Format date separator
    const formatDate = (dateStr) => {
        const date = new Date(dateStr)
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        if (date.toDateString() === today.toDateString()) return 'Today'
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }

    // Check if we need a date separator
    const shouldShowDate = (index) => {
        if (index === 0) return true
        const curr = new Date(messages[index].createdAt).toDateString()
        const prev = new Date(messages[index - 1].createdAt).toDateString()
        return curr !== prev
    }

    return (
        <div className="chat-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="chat-container">
                {/* Header */}
                <div className="chat-header">
                    <img src={patientImage} alt={patientName} className="chat-header-avatar" />
                    <div className="chat-header-info">
                        <div className="chat-header-name">{patientName}</div>
                        <div className="chat-header-status">
                            {isTyping ? (
                                'Typing...'
                            ) : (
                                <>
                                    <span className="online-dot"></span>
                                    Available
                                </>
                            )}
                        </div>
                    </div>
                    <button className="chat-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Messages */}
                {loading ? (
                    <div className="chat-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <div className="icon">💬</div>
                        <p>Start a conversation with {patientName}</p>
                    </div>
                ) : (
                    <div className="chat-messages">
                        {messages.map((msg, index) => (
                            <React.Fragment key={msg._id || index}>
                                {shouldShowDate(index) && (
                                    <div className="chat-date-separator">
                                        <span>{formatDate(msg.createdAt)}</span>
                                    </div>
                                )}
                                <div
                                    className={`chat-message ${msg.senderType === 'doctor' ? 'sent' : 'received'}`}
                                >
                                    {msg.message}
                                    <span className="chat-message-time">
                                        {formatTime(msg.createdAt)}
                                    </span>
                                </div>
                            </React.Fragment>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div className="chat-typing-indicator">
                                <div className="dot"></div>
                                <div className="dot"></div>
                                <div className="dot"></div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Input */}
                <div className="chat-input-area">
                    <textarea
                        ref={inputRef}
                        className="chat-input"
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        rows={1}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                    >
                        ➤
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChatWindow
