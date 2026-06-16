import React, { useContext } from 'react'
import { AdminContext } from '../../context/AdminContext'
import { useEffect } from 'react'

const AllAppointments = () => {

  const {aToken,appointments,getAllAppointments}=useContext(AdminContext)

  useEffect(()=>{
    getAllAppointments()
  },[aToken])

  return (
    <div>
      <p>All Appointments</p>

      <div>

        <div>
          <p>#</p>
          <p>Patient</p>
          <p>Age</p>
          <p>Date & Time</p>
          <p>Doctor</p>
          <p>Fees</p>
          <p>Actions</p>
        </div>
        
      </div>
      
    </div>
  )
}

export default AllAppointments