import axios from "axios";
import { useState, useEffect } from "react";
import { createContext } from "react";
import { toast } from 'react-toastify'

export const DoctorContext = createContext()

const DoctorContextProvider = (props) => {

    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const [dToken, setDToken] = useState(localStorage.getItem('dToken') ? localStorage.getItem('dToken') : '')
    const [appointments, setAppointments] = useState([])
    const [dashData, setDashData] = useState(false)
    const [profileData, setProfileData] = useState(false)
    const [selectedAppt, setSelectedAppt] = useState(null)
    const [unreadCounts, setUnreadCounts] = useState({})

    const fetchUnreadCounts = async (appointmentsList = appointments) => {
        if (!dToken || appointmentsList.length === 0) return
        try {
            const counts = {}
            await Promise.all(
                appointmentsList.map(async (appt) => {
                    try {
                        const { data } = await axios.get(
                            backendUrl + `/api/chat/doctor/unread/${appt._id}`,
                            { headers: { dtoken: dToken } }
                        )
                        if (data.success) {
                            counts[appt._id] = data.count
                        }
                    } catch (err) {
                        console.log(err)
                    }
                })
            )
            setUnreadCounts(counts)
        } catch (error) {
            console.log(error)
        }
    }

    const getAppointments = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/doctor/appointments', { headers: { dtoken: dToken } })
            if (data.success) {
                setAppointments(data.appointments)
                fetchUnreadCounts(data.appointments)
                console.log(data.appointments)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }

    }

    const completeAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(backendUrl + '/api/doctor/complete-appointment', { appointmentId }, { headers: { dtoken: dToken } })
            if (data.success) {
                toast.success(data.message)
                await getAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    const cancelAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(backendUrl + '/api/doctor/cancel-appointment', { appointmentId }, { headers: { dtoken: dToken } })
            if (data.success) {
                toast.success(data.message)
                await getAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    const getDashData = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/doctor/dashboard', { headers: { dtoken: dToken } })
            if (data.success) {
                setDashData(data.dashData)
                console.log(data.dashData)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    const getProfileData = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/doctor/profile', { headers: { dtoken: dToken } })
            if (data.success) {
                setProfileData(data.profileData)
                console.log(data.profileData)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    const unreadTotal = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

    const value = {
        backendUrl, dToken,
        setDToken,
        getAppointments,
        appointments, setAppointments,
        completeAppointment, cancelAppointment,
        getDashData, dashData, setDashData,
        profileData, setProfileData,
        getProfileData,
        selectedAppt, setSelectedAppt,
        unreadCounts, setUnreadCounts,
        unreadTotal, fetchUnreadCounts
    }

    useEffect(() => {
        if (dToken) {
            getProfileData()
        } else {
            setProfileData(false)
        }
    }, [dToken])

    return (
        <DoctorContext.Provider value={value}>
            {props.children}
        </DoctorContext.Provider>
    )
}

export default DoctorContextProvider