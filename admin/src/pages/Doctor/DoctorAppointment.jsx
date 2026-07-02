import React, { useContext, useEffect, useState } from 'react'
import { DoctorContext } from '../../context/DoctorContext'
import { AppContext } from '../../context/AppContext'
import { SocketContext } from '../../context/SocketContext'
import { assets } from '../../assets/assets'
import ChatWindow from '../../components/ChatWindow'
import CallWindow from '../../components/CallWindow'
import { toast } from 'react-toastify'

const DoctorAppointment = () => {
    const { dToken, appointments, getAppointments, cancelAppointment, completeAppointment, profileData } = useContext(DoctorContext)
    const { calculateAge, slotDateFormat, currency } = useContext(AppContext)
    const { socket } = useContext(SocketContext)

    const [showChat, setShowChat] = useState(null)
    const [showCall, setShowCall] = useState(null)
    const [isCallCaller, setIsCallCaller] = useState(false)
    const [incomingCallData, setIncomingCallData] = useState(null)

    useEffect(() => {
        if (dToken) {
            getAppointments()
        }
    }, [dToken])

    // Socket.IO call listeners for doctor
    useEffect(() => {
        if (!socket) return

        const handleIncomingCall = (callData) => {
            console.log('Doctor incoming call event received:', callData)
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
            socket.off('incoming-call', handleIncomingCall)
            socket.off('call-ended', handleCallEndedGlobal)
        }
    }, [socket, appointments])

    const acceptCall = () => {
        if (incomingCallData) {
            setShowCall(incomingCallData.appointment)
            setIsCallCaller(false)
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

    return (
        <div className='w-full max-w-6xl m-5 relative'>
            <p className='mb-3 text-lg font-medium'>All Appointments</p>
            <div className='bg-white border rounded text-sm max-h-[80vh] min-h-[50vh] overflow-y-scroll'>
                <div className='max-sm:hidden grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1.5fr] gap-1 py-3 px-6 border-b'>
                    <p>#</p>
                    <p>Patient</p>
                    <p>Payment</p>
                    <p>Age</p>
                    <p>Date & Time</p>
                    <p>Fees</p>
                    <p className="text-center">Action</p>
                </div>

                {
                    [...appointments].reverse().map((item, index) => (
                        <div key={index} className='flex flex-wrap justify-between max-sm:gap-5 max-sm:text-base sm:grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1.5fr] gap-1 items-center text-gray-500 py-3 px-6 border-b hover:bg-gray-50'>
                            <p className='max-sm:hidden'>{index + 1}</p>
                            <div className='flex items-center gap-2'>
                                <img className='w-8 rounded-full' src={item.userData.image} alt="" />
                                <p>{item.userData.name}</p>
                            </div>
                            <div>
                                <p className='text-xs inline border border-primary px-2 rounded-full'>{item.payment ? 'Online' : 'CASH'}</p>
                            </div>
                            <p className='max-sm:hidden'>{calculateAge(item.userData.dob)}</p>
                            <p>{slotDateFormat(item.slotDate)}, {item.slotTime}</p>
                            <p>{currency}{item.amount}</p>
                            {
                                item.cancelled
                                    ? <p className='text-red-400 text-xs font-medium text-center'>Cancelled</p>
                                    : item.isCompleted
                                        ? <p className='text-green-500 text-xs font-medium text-center'>Completed</p>
                                        : <div className='flex items-center justify-center gap-3'>
                                            <img onClick={() => cancelAppointment(item._id)} className='w-8 cursor-pointer hover:scale-110 transition-transform' src={assets.cancel_icon} alt="Cancel" title="Cancel Appointment" />
                                            <img onClick={() => completeAppointment(item._id)} className='w-8 cursor-pointer hover:scale-110 transition-transform' src={assets.tick_icon} alt="Complete" title="Complete Appointment" />
                                            
                                            <button 
                                                onClick={() => setShowChat(item)} 
                                                className='w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-650 hover:text-white transition-all duration-200' 
                                                title="Message Patient"
                                            >
                                                💬
                                            </button>
                                            
                                            <button 
                                                onClick={() => { setShowCall(item); setIsCallCaller(true); }} 
                                                className='w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-full hover:bg-green-650 hover:text-white transition-all duration-200' 
                                                title="Call Patient"
                                            >
                                                📞
                                            </button>
                                        </div>
                            }
                        </div>
                    ))
                }
            </div>

            {/* Chat Modal */}
            {showChat && (
                <ChatWindow 
                    appointment={showChat} 
                    onClose={() => setShowChat(null)} 
                />
            )}

            {/* Call Overlay */}
            {showCall && (
                <CallWindow 
                    appointment={showCall} 
                    isCaller={isCallCaller} 
                    onClose={() => setShowCall(null)} 
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

export default DoctorAppointment