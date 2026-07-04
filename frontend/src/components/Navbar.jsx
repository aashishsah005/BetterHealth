import React, { useContext, useState } from 'react'
import {assets} from '../assets/assets'
import { NavLink, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext';
const Navbar = () => {
  
    const navigate = useNavigate();

    const {token, setToken, userData} =useContext(AppContext)

    const [showMenu, setShowMenu] = useState(false)
    const [showProfileMenu, setShowProfileMenu] = useState(false)
  
    const logut=()=>{
        setToken(false)
        localStorage.removeItem('token')
        navigate('/')
    }
    return (
    <div className='flex items-center justify-between text-sm py-4 mb-5 border-b border-b-gray-400'>
        <img onClick={()=>navigate('/')} className='w-44 cursor-pointer' src={assets.logo} alt="" />
        <ul className='hidden md:flex items-start gap-5 font-medium'>
            <NavLink to='/'>
                <li className='py-1'>HOME</li>
                <hr className='border-none outline-none h-0.5 bg-primary w-3/5 m-auto hidden' />
            </NavLink>
            <NavLink to='/doctors'>
                <li className='py-1'>ALL DOCTORS</li>
                <hr className='border-none outline-none h-0.5 bg-primary w-3/5 m-auto hidden' />
            </NavLink>
            <NavLink to='/about'>
                <li className='py-1'>ABOUT</li>
                <hr className='border-none outline-none h-0.5 bg-primary w-3/5 m-auto hidden' />
            </NavLink>
            <NavLink to='/contact'>
                <li className='py-1'>CONTACT</li>
                <hr className='border-none outline-none h-0.5 bg-primary w-3/5 m-auto hidden' />
            </NavLink>
        </ul>
        <div className='flex item-center gap-4'>
            {
                token
                ? <div onMouseEnter={() => setShowProfileMenu(true)} onMouseLeave={() => setShowProfileMenu(false)} className='flex items-center gap-2 cursor-pointer relative'>
                    {userData && <span className='text-sm font-medium text-gray-605 hidden sm:block mr-2'>Hi, {userData.name}!</span>}
                    <img className='w-8 rounded-full' src={userData && userData.image ? userData.image : assets.profile_pic} alt="" />
                    <div className={`absolute top-0 right-0 pt-14 text-base font-medium text-gray-600 z-20 ${showProfileMenu ? 'block' : 'hidden'}`}>
                        <div className='min-w-48 bg-stone-100 rounded flex flex-col gap-4 p-4'>
                            <p onClick={()=>{navigate('/my-profile'); setShowProfileMenu(false)}} className='hover:text-black cursor-pointer'>My Profile</p>
                            <p onClick={()=>{navigate('/my-appointments'); setShowProfileMenu(false)}} className='hover:text-black cursor-pointer'>My Appointments</p>
                            <p onClick={()=>{logut(); setShowProfileMenu(false)}} className='hover:text-black cursor-pointer'>LogOut</p>
                        </div>
                    </div>
                </div> : <button onClick={()=>navigate('/login')} className='bg-primary text-white px-8 py-3 rounded-full font-light hidden md:block'>Create Account</button>

            }
            <img onClick={()=>setShowMenu(true)} className='w-6 md:hidden' src={assets.menu_icon} alt="" />
            {/* -----------Mobile View-------------- */}
            <div className={` ${showMenu ? 'fixed w-full' : 'h-0 w-0'} md:hidden right-0 top-0 bottom-0 z-20 overflow-hidden bg-white transition-all`}>
                <div className='flex item-center justify-between px-5 py-6'>
                    <img className='w-36' src={assets.logo} alt="" />
                    <img className='w-7' onClick={()=>setShowMenu(false)} src={assets.cross_icon} alt="" />
                </div>
                <ul className='flex flex-col items-center gap-2 mt-5 text-lg font-medium'>
                    <NavLink onClick={()=>setShowMenu(false)} to='/'><p className='px-4 py-2 rounded inline-block'>Home</p></NavLink>
                    <NavLink onClick={()=>setShowMenu(false)} to='/doctors'><p className='px-4 py-2 rounded inline-block'>All Doctors</p></NavLink>
                    <NavLink onClick={()=>setShowMenu(false)} to='/about'><p className='px-4 py-2 rounded inline-block'>About</p></NavLink>
                    <NavLink onClick={()=>setShowMenu(false)} to='/contact'><p className='px-4 py-2 rounded inline-block'>Contact</p></NavLink>
                    {
                        token ? (
                            <>
                                <NavLink onClick={()=>setShowMenu(false)} to='/my-profile'><p className='px-4 py-2 rounded inline-block'>My Profile</p></NavLink>
                                <NavLink onClick={()=>setShowMenu(false)} to='/my-appointments'><p className='px-4 py-2 rounded inline-block'>My Appointments</p></NavLink>
                                <p onClick={()=>{setShowMenu(false); logut()}} className='px-4 py-2 rounded inline-block cursor-pointer text-red-500 font-semibold'>Logout</p>
                            </>
                        ) : (
                            <NavLink onClick={()=>setShowMenu(false)} to='/login'><p className='px-4 py-2 rounded inline-block bg-primary text-white font-light'>Create Account</p></NavLink>
                        )
                    }
                </ul>
            </div>
        </div>
    </div>
  )
}

export default Navbar