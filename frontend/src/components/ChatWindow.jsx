import React, { useState, useEffect, useRef, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import { SocketContext } from '../context/SocketContext'
import axios from 'axios'
import './ChatWindow.css'

const ChatWindow = ({ appointment, onClose }) => {
    const { backendUrl, token, userData } = useContext(AppContext)
    const { socket } = useContext(SocketContext)

    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [loading, setLoading] = useState(true)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    const doctorName = appointment.docData.name
    const doctorImage = appointment.docData.image
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
                    `${backendUrl}/api/chat/messages/${appointmentId}`,
                    { headers: { token } }
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
    }, [appointmentId, backendUrl, token])

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
            if (senderType === 'doctor') {
                setIsTyping(true)
            }
        }

        const handleStopTyping = ({ senderType }) => {
            if (senderType === 'doctor') {
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
            senderId: userData._id,
            senderType: 'user',
            message: trimmed
        })

        // Stop typing indicator
        socket.emit('stop-typing', {
            appointmentId,
            senderId: userData._id,
            senderType: 'user'
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
            senderId: userData._id,
            senderType: 'user'
        })

        // Clear previous timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        // Stop typing after 2 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop-typing', {
                appointmentId,
                senderId: userData._id,
                senderType: 'user'
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
                    <div className="chat-header-left">
                        <div className="avatar-wrapper">
                            <img src={doctorImage} alt={doctorName} className="chat-header-avatar" />
                            <span className={`status-badge ${isTyping ? 'typing' : 'online'}`}></span>
                        </div>
                        <div className="chat-header-info">
                            <div className="chat-header-name">{doctorName}</div>
                            <div className="chat-header-status">
                                {isTyping ? 'Typing...' : 'Active now'}
                            </div>
                        </div>
                    </div>
                    <div className="chat-header-actions">
                        <button className="chat-header-btn" title="Start Voice Call">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </button>
                        <button className="chat-header-btn" title="Start Video Call">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                            </svg>
                        </button>
                        <button className="chat-close-btn" onClick={onClose} title="Close Chat">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                {loading ? (
                    <div className="chat-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <div className="icon">
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <p>Start a conversation with {doctorName}</p>
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
                                    className={`chat-message ${msg.senderType === 'user' ? 'sent' : 'received'}`}
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
                    <button className="chat-attach-btn" title="Attach file or report">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                        </svg>
                    </button>
                    <div className="chat-input-wrapper">
                        <textarea
                            ref={inputRef}
                            className="chat-input"
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            rows={1}
                        />
                    </div>
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                        title="Send message"
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChatWindow
