import React, { useContext, useEffect, useState } from 'react'
import { AppContext } from '../context/AppContext'
import { SocketContext } from '../context/SocketContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import ChatWindow from '../components/ChatWindow'
import CallWindow from '../components/CallWindow'
import { assets } from '../assets/assets'

const MyAppointments = () => {
  const { backendUrl, token, getDoctorsData, userData } = useContext(AppContext)
  const { socket } = useContext(SocketContext)

  const [appointments, setAppointments] = useState([])
  const [showChat, setShowChat] = useState(null)
  const [showCall, setShowCall] = useState(null)
  const [isCallCaller, setIsCallCaller] = useState(false)
  const [callIsAudioOnly, setCallIsAudioOnly] = useState(false)
  const [incomingCallData, setIncomingCallData] = useState(null)

  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const navigate = useNavigate()

  const slotDateFormat = (slotDate) => {
    const dateArray = slotDate.split("-")
    return dateArray[0] + " " + months[Number(dateArray[1])] + " " + dateArray[2]
  }

  const fetchAppointments = async () => {
    try {
      const { data } = await axios.get(backendUrl + '/api/user/appointments', { headers: { token } })
      if (data.success) {
        setAppointments(data.appointments.reverse())
      }
    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }
  }

  const cancelAppointment = async (appointmentId) => {
    try {
      const { data } = await axios.post(backendUrl + '/api/user/cancel-appointment', { appointmentId }, { headers: { token } })
      if (data.success) {
        toast.success(data.message)
        fetchAppointments()
        getDoctorsData()
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }
  }

  const initPay = (order) => {
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: "Appointment Payment",
      description: "Appointment Payment",
      receipt: order.receipt,
      handler: async (response) => {
        try {
          const { data } = await axios.post(backendUrl + '/api/user/verify-razorpay', response, { headers: { token } })
          if (data.success) {
            toast.success(data.message)
            fetchAppointments()
            navigate('/my-appointments')
          } else {
            toast.error(data.message)
          }
        } catch (error) {
          console.log(error)
          toast.error(error.message)
        }
      }
    }

    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  const appointmentRazorpay = async (appointmentId) => {
    try {
      const { data } = await axios.post(backendUrl + '/api/user/payment', { appointmentId }, { headers: { token } })
      if (data.success) {
        initPay(data.order)
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.log(error)
      toast.error(error.message)
    }
  }

  useEffect(() => {
    if (token) {
      fetchAppointments()
    }
  }, [token])

  // Socket.IO call listeners
  useEffect(() => {
    if (!socket) return

    const handleIncomingCall = (callData) => {
      console.log('Incoming call event received:', callData)
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

  // Called by MyAppointments call buttons or ChatWindow header call buttons
  const handleStartCall = ({ appointment, isAudioOnly }) => {
    setShowCall(appointment)
    setIsCallCaller(true)
    setCallIsAudioOnly(isAudioOnly)
    setShowChat(null) // close chat when starting a call
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
    if (incomingCallData && socket && userData) {
      socket.emit('call-rejected', {
        appointmentId: incomingCallData.appointment._id,
        rejecterId: userData._id
      })
      setIncomingCallData(null)
    }
  }

  return (
    <div className="relative">
      <p className='pb-3 mt-12 font-medium text-zinc-700 border-b'>My Appointments</p>
      <div>
        {appointments.map((item, index) => (
          <div className='grid grid-cols-[1fr_2fr] gap-4 sm:flex sm:gap-6 py-2 border-b' key={index}>
            <div>
              <img className='w-32 bg-indigo-50' src={item.docData.image} alt="" />
            </div>
            <div className='flex-1 text-sm text-zinc-600'>
              <p className='text-neutral-800 font-semibold'>{item.docData.name}</p>
              <p>{item.docData.speciality}</p>
              <p className='text-zinc-700 font-medium mt-1'>Address:</p>
              <p className='text-xs'>{item.docData.address}</p>
              <p className='text-xs mt-1'>
                <span className='text-sm text-neutral-700 font-medium'>Date & Time: </span>
                {slotDateFormat(item.slotDate)} | {item.slotTime}
              </p>
            </div>
            <div></div>
            <div className='flex flex-col gap-2 justify-end'>
              {/* Message & Call buttons for active paid appointments */}
              {!item.cancelled && item.payment && !item.isCompleted && (
                <>
                  <button
                    onClick={() => setShowChat(item)}
                    className='text-sm text-stone-500 text-center sm:min-w-48 py-2 border border-indigo-500 rounded hover:bg-indigo-600 hover:text-white transition-all duration-300 font-medium flex items-center justify-center gap-2'
                  >
                    <img className='w-4 h-4' src={assets.message_icon} alt="" />
                    Message Doctor
                  </button>
                  <button
                    onClick={() => handleStartCall({ appointment: item, isAudioOnly: false })}
                    className='text-sm text-stone-500 text-center sm:min-w-48 py-2 border border-green-500 rounded hover:bg-green-600 hover:text-white transition-all duration-300 font-medium flex items-center justify-center gap-2'
                  >
                    <img className='w-4 h-4' src={assets.call_icon} alt="" />
                    Call Doctor
                  </button>
                </>
              )}

              {!item.cancelled && !item.payment && !item.isCompleted && (
                <button
                  onClick={() => appointmentRazorpay(item._id)}
                  className='text-sm text-stone-500 text-center sm:min-w-48 py-2 border rounded hover:bg-primary hover:text-white transition-all duration-300'
                >
                  Pay Online
                </button>
              )}
              {!item.cancelled && !item.isCompleted && (
                <button
                  onClick={() => cancelAppointment(item._id)}
                  className='text-sm text-stone-500 text-center sm:min-w-48 py-2 border rounded hover:bg-red-600 hover:text-white transition-all duration-300'
                >
                  Cancel appointment
                </button>
              )}
              {item.cancelled && !item.isCompleted && (
                <button className='sm:min-w-48 py-2 border border-red-500 rounded text-red-500 bg-red-50 font-medium'>
                  Appointment cancelled
                </button>
              )}
              {item.isCompleted && (
                <button className='sm:min-w-48 py-2 border border-green-500 rounded text-green-500 bg-green-50 font-medium'>
                  Appointment completed
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Render Chat Component */}
      {showChat && (
        <ChatWindow
          appointment={showChat}
          onClose={() => setShowChat(null)}
          onStartCall={handleStartCall}
        />
      )}

      {/* Render Call Component */}
      {showCall && (
        <CallWindow
          appointment={showCall}
          isCaller={isCallCaller}
          isAudioOnly={callIsAudioOnly}
          onClose={() => { setShowCall(null); setCallIsAudioOnly(false); }}
        />
      )}

      {/* Global Premium Incoming Call Dialog/Notification */}
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
              <h3 className="text-lg font-semibold text-zinc-850">{incomingCallData.callerName}</h3>
              <p className="text-sm text-zinc-500 mt-1">Incoming {incomingCallData.callType} call...</p>
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

export default MyAppointments