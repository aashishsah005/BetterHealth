import { createContext, useContext, useEffect, useState } from "react"
import { io } from "socket.io-client"
import { DoctorContext } from "./DoctorContext"

export const SocketContext = createContext()

const SocketContextProvider = (props) => {
    const { backendUrl, dToken, profileData } = useContext(DoctorContext)
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
