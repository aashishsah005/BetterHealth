import React, { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { DoctorContext } from '../context/DoctorContext'
import { SocketContext } from '../context/SocketContext'
import { assets } from '../assets/assets'
import axios from 'axios'
import { toast } from 'react-toastify'
import './ChatWindow.css'

const ChatWindow = ({ appointment, onClose, onStartCall }) => {
    const { backendUrl, dToken, profileData } = useContext(DoctorContext)
    const { socket } = useContext(SocketContext)

    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [loading, setLoading] = useState(true)
    const [uploadingFile, setUploadingFile] = useState(false)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const fileInputRef = useRef(null)

    const patientName = appointment?.userData?.name || 'Patient'
    const patientImage = appointment?.userData?.image || ''
    const appointmentId = appointment?._id

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
                console.log('[ChatWindow] Error fetching messages:', error)
            } finally {
                setLoading(false)
            }
        }

        if (appointmentId && dToken) fetchMessages()
    }, [appointmentId, backendUrl, dToken])

    // Socket.IO event listeners
    useEffect(() => {
        if (!socket) return

        // Join the appointment room
        const join = () => {
            console.log('[Doctor Chat] Joining room:', appointmentId)
            socket.emit('join-room', { appointmentId })
        }

        join()

        socket.on('connect', join)

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
            if (senderType === 'user') setIsTyping(true)
        }

        const handleStopTyping = ({ senderType }) => {
            if (senderType === 'user') setIsTyping(false)
        }

        socket.on('receive-message', handleReceiveMessage)
        socket.on('user-typing', handleTyping)
        socket.on('user-stop-typing', handleStopTyping)

        return () => {
            socket.off('connect', join)
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
    const handleSend = useCallback(() => {
        const trimmed = newMessage.trim()
        if (!trimmed || !socket) return

        socket.emit('send-message', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor',
            message: trimmed
        })

        socket.emit('stop-typing', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        setNewMessage('')
        inputRef.current?.focus()
    }, [newMessage, socket, appointmentId, profileData])

    // Handle typing indicator
    const handleInputChange = (e) => {
        setNewMessage(e.target.value)

        if (!socket) return

        socket.emit('typing', {
            appointmentId,
            senderId: profileData._id,
            senderType: 'doctor'
        })

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

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

    // ─── File Attachment ────────────────────────────────────────────────────────
    const handleAttachClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Reset file input
        e.target.value = ''

        // 10 MB limit
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
                {
                    headers: {
                        dtoken: dToken,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            )

            if (data.success) {
                toast.success('File sent!')
            } else {
                toast.error(data.message || 'Failed to send file.')
            }
        } catch (error) {
            console.error('[ChatWindow] File upload error:', error)
            toast.error('Failed to send file. Please try again.')
        } finally {
            setUploadingFile(false)
        }
    }

    // ─── Call Handlers ──────────────────────────────────────────────────────────
    const handleAudioCall = () => {
        if (onStartCall) {
            onStartCall({ appointment, isAudioOnly: true })
        }
    }

    const handleVideoCall = () => {
        if (onStartCall) {
            onStartCall({ appointment, isAudioOnly: false })
        }
    }

    // ─── Formatting Helpers ─────────────────────────────────────────────────────
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

    const isImageFile = (url) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)

    return (
        <div className="chat-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="chat-container">
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-left">
                        <div className="avatar-wrapper">
                            <img src={patientImage} alt={patientName} className="chat-header-avatar" />
                            <span className={`status-badge ${isTyping ? 'typing' : 'online'}`}></span>
                        </div>
                        <div className="chat-header-info">
                            <div className="chat-header-name">{patientName}</div>
                            <div className="chat-header-status">
                                {isTyping ? 'Typing...' : 'Active now'}
                            </div>
                        </div>
                    </div>
                    <div className="chat-header-actions">
                        {/* Audio Call Button */}
                        <button
                            className="chat-header-btn"
                            title="Start Voice Call"
                            onClick={handleAudioCall}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </button>
                        {/* Video Call Button */}
                        <button
                            className="chat-header-btn"
                            title="Start Video Call"
                            onClick={handleVideoCall}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                            </svg>
                        </button>
                        <button className="chat-close-btn" onClick={onClose} title="Close Chat">
                            ✕
                        </button>
                    </div>
                </div>

                {/* Messages */}
                {loading ? (
                    <div className="chat-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <div className="icon">
                            <img src={assets.call_icon} alt="" style={{ width: '40px', height: '40px', opacity: 0.4 }} />
                        </div>
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
                                {/* Call log messages */}
                                {msg.type === 'call' ? (
                                    <div className="chat-call-log">
                                        <span className="call-log-icon">
                                            {msg.callType === 'video' ? (
                                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                            )}
                                        </span>
                                        <span className="call-log-text">{msg.message}</span>
                                        <span className="call-log-time">{formatTime(msg.createdAt)}</span>
                                    </div>
                                ) : (
                                <div className={`chat-message ${msg.senderType === 'doctor' ? 'sent' : 'received'}`}>
                                    {/* File attachment rendering */}
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
                                    <span className="chat-message-time">
                                        {formatTime(msg.createdAt)}
                                    </span>
                                </div>
                                )}
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
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        onChange={handleFileSelected}
                    />
                    {/* Attach button */}
                    <button
                        className="chat-attach-btn"
                        title="Attach file or report"
                        onClick={handleAttachClick}
                        disabled={uploadingFile}
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
                        disabled={!newMessage.trim() || uploadingFile}
                        title="Send message"
                    >
                        <img src={assets.send_icon} alt="Send" style={{ width: '18px', height: '18px', filter: 'brightness(0) invert(1)' }} />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChatWindow
