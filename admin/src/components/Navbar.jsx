import React, { useContext } from 'react'
import { AdminContext } from '../context/AdminContext'
import { assets } from '../assets/assets'
import { useNavigate } from 'react-router-dom'
import { DoctorContext } from '../context/DoctorContext'

const Navbar = () => {

    const {aToken, setAToken}=useContext(AdminContext)
    const {dToken, setDToken, profileData}=useContext(DoctorContext)
    
    const navigate=useNavigate()

    const logout=()=>{
      navigate('/')
      aToken && setAToken('')
      aToken && localStorage.removeItem('aToken')
      dToken && setDToken('')
      dToken && localStorage.removeItem('dToken')
    }

  return (
    <div className='flex justify-between items-center px-4 sm:px-10 py-3 border-b bg-white'>
        <div className='flex items-center gap-2 text-xs'>
            <img className='w-36 sm:w-40 cursor-pointer' src={assets.logo} alt="" />
            <p className='border px-2.5 py-0.5 rounded-full border-gray-500 text-gray-600'>{aToken?'Admin':'Doctor'}</p>
        </div>
        <div className='flex items-center gap-4'>
            {aToken && <p className='text-sm text-gray-600 font-medium hidden sm:block'>Welcome, Admin</p>}
            {dToken && profileData && <p className='text-sm text-gray-600 font-medium hidden sm:block'>Welcome, {profileData.name}</p>}
            <button onClick={logout} className='bg-primary text-white text-sm px-10 py-2 rounded-full'>Logout</button>
        </div>
    </div>
  )
}

export default Navbar