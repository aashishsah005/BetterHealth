import React,{ useContext } from 'react'
import { AdminContext } from '../context/AdminContext'
import { NavLink } from 'react-router-dom'
import { assets } from '../assets/assets'
import { DoctorContext } from '../context/DoctorContext'
const Sidebar = () => {

  const {aToken}=useContext(AdminContext)
  const {dToken, unreadTotal}=useContext(DoctorContext)

  return (
    <div className='min-h-screen bg-white border-r'>
       {
          aToken && <ul className='text-[#515151] mt-5'>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/admin-dashboard'}>
            <img src={assets.home_icon} alt="" />
            <p className='hidden md:block'>Dashboard</p>
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/all-appointments'}>
            <img src={assets.appointment_icon} alt="" />
            <p className='hidden md:block'>Appointments</p>
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/add-doctor'}>
            <img src={assets.add_icon} alt="" />
            <p className='hidden md:block'>Add Doctor</p>
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-list'}>
            <img src={assets.people_icon} alt="" />
            <p className='hidden md:block'>Doctor List</p>
          </NavLink>
        </ul>
      }   

      {
          dToken && <ul className='text-[#515151] mt-5'>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-dashboard'}>
            <img src={assets.home_icon} alt="" />
            <p className='hidden md:block'>Dashboard</p>
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-appointment'}>
            <img src={assets.appointment_icon} alt="" />
            <p className='hidden md:block'>Appointments</p>
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-consultations'}>
            <img src={assets.list_icon} className='w-5 h-5' alt="" />
            <p className='hidden md:block'>CareScribe AI</p>
          </NavLink>


          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-messages'}>
            <img src={assets.chats_icon} className='w-5 h-5' alt="" />
            <p className='hidden md:block'>Messages</p>
            {unreadTotal > 0 && (
              <span className="ml-auto bg-[#10b981] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadTotal}
              </span>
            )}
          </NavLink>

          <NavLink className={({isActive})=>`flex items-center gap-3 py-3.5 px-3 md:px-9 md:min-w-72 cursor-pointer ${isActive ? 'bg-[#F2F3FF] border-r-4 border-primary' : ''}`} to={'/doctor-profile'}>
            <img src={assets.profile_icon} alt="" />
            <p className='hidden md:block'>Profile</p>
          </NavLink>
        </ul>
      }  
    </div>
  )
}

export default Sidebar