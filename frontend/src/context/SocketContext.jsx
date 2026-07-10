import { createContext, useContext, useEffect, useState } from "react"
import { io } from "socket.io-client"
import { AppContext } from "./AppContext"

export const SocketContext = createContext()

const SocketContextProvider = (props) => {
    const { backendUrl, token, userData } = useContext(AppContext)
    const [socket, setSocket] = useState(null)
    const [onlineUsers, setOnlineUsers] = useState(new Set())

    useEffect(() => {
        if (token && backendUrl && userData && userData._id) {
            // Connect to socket server
            const socketUrl = backendUrl.replace('/api', '').replace(':4000', ':4000')
            // Extract base URL (remove any path)
            const baseUrl = new URL(backendUrl).origin

            const newSocket = io(baseUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            })

            newSocket.on('connect', () => {
                console.log('[Socket] Connected:', newSocket.id)
                // Register this user with their MongoDB ID
                newSocket.emit('register', {
                    odId: userData._id,   // kept as odId to match server handler
                    role: 'user'
                })
            })

            newSocket.on('online-users', (users) => {
                setOnlineUsers(new Set(users))
            })

            newSocket.on('disconnect', () => {
                console.log('Socket disconnected')
                setOnlineUsers(new Set())
            })

            newSocket.on('connect_error', (error) => {
                console.log('Socket connection error:', error.message)
            })

            setSocket(newSocket)

            return () => {
                newSocket.disconnect()
                setSocket(null)
                setOnlineUsers(new Set())
            }
        } else {
            // No token or userData, disconnect if connected
            if (socket) {
                socket.disconnect()
                setSocket(null)
                setOnlineUsers(new Set())
            }
        }
    }, [token, backendUrl, userData])

    const value = {
        socket,
        onlineUsers
    }

    return (
        <SocketContext.Provider value={value}>
            {props.children}
        </SocketContext.Provider>
    )
}

export default SocketContextProvider
