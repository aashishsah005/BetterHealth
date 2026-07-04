import { createContext, useContext, useEffect, useState } from "react"
import { io } from "socket.io-client"
import { DoctorContext } from "./DoctorContext"

export const SocketContext = createContext()

const SocketContextProvider = (props) => {
    const { backendUrl, dToken, profileData, appointments, selectedAppt, setUnreadCounts } = useContext(DoctorContext)
    const [socket, setSocket] = useState(null)

    useEffect(() => {
        if (dToken && backendUrl && profileData && profileData._id) {
            // Extract base URL
            const baseUrl = new URL(backendUrl).origin

            const newSocket = io(baseUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            })

            newSocket.on('connect', () => {
                console.log('Admin Socket connected:', newSocket.id)
                // Register doctor
                newSocket.emit('register', {
                    odId: profileData._id,
                    role: 'doctor'
                })
            })

            newSocket.on('disconnect', () => {
                console.log('Admin Socket disconnected')
            })

            newSocket.on('connect_error', (error) => {
                console.log('Admin Socket connection error:', error.message)
            })

            setSocket(newSocket)

            return () => {
                newSocket.disconnect()
                setSocket(null)
            }
        } else {
            if (socket) {
                socket.disconnect()
                setSocket(null)
            }
        }
    }, [dToken, backendUrl, profileData])

    // Play Web Audio alert beep
    const playNotificationSound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5 note
            gain2.gain.setValueAtTime(0, ctx.currentTime);
            gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc2.start(ctx.currentTime + 0.1);
            
            osc.stop(ctx.currentTime + 0.2);
            osc2.stop(ctx.currentTime + 0.35);
        } catch (e) {
            console.log("Audio play error:", e);
        }
    }

    // Join all appointment rooms when connected or appointments loaded
    useEffect(() => {
        if (!socket || appointments.length === 0) return

        appointments.forEach(appt => {
            socket.emit('join-room', { appointmentId: appt._id })
        })

        return () => {
            appointments.forEach(appt => {
                socket.emit('leave-room', { appointmentId: appt._id })
            })
        }
    }, [socket, appointments])

    // Global Socket.IO listener for incoming messages to manage unread counts and play sounds
    useEffect(() => {
        if (!socket) return

        const handleReceiveMessage = (msg) => {
            if (msg.senderType === 'user') {
                // If we are not currently active on this specific chat, increment its unread count
                if (!selectedAppt || selectedAppt._id !== msg.appointmentId) {
                    setUnreadCounts(prev => ({
                        ...prev,
                        [msg.appointmentId]: (prev[msg.appointmentId] || 0) + 1
                    }))
                }

                // Play notification alert
                playNotificationSound()
            }
        }

        socket.on('receive-message', handleReceiveMessage)

        return () => {
            socket.off('receive-message', handleReceiveMessage)
        }
    }, [socket, selectedAppt])

    const value = {
        socket
    }

    return (
        <SocketContext.Provider value={value}>
            {props.children}
        </SocketContext.Provider>
    )
}

export default SocketContextProvider
