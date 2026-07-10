import React from 'react'
import { assets } from '../assets/assets'

const Footer = () => {
  return (
    <div className='md:mx-10'>
        <div className='flex flex-col sm:grid grid-cols-[3fr_1fr_1fr] gap-14 my-10 mt-40 text-sm'>

            {/* -------left Section------- */}
            <div>
                <img className='mb:5 w-40' src={assets.logo} alt="" />
                <p className='w-full md:w-2/3 text-gray-600 leading-6'>Our platform connects patients with trusted medical professionals, offering seamless appointment booking, health tracking, and personalized care solutions. At BetterHealth, we prioritize innovation, security, and patient well-being to help you lead a healthier, happier life.</p>
            </div>

            {/* --------center Section-------- */}
            <div>
                <p className='text-xl font-medium mb-5'>Company</p>
                <ul className='flex flex-col gap-2 text-gray-600'>
                    <li>Home</li>
                    <li>About Us</li>
                    <li>Contact Us</li>
                    <li>Privacy Policy</li>
                </ul>
            </div>

            {/* ---------Rigght Section--------- */}
            <div>
                <p className='text-xl font-medium mb-5'>Get In Touch</p>
                <ul className='flex flex-col gap-2 text-gray-600'>
                    <li>+91 9608449927</li>
                    <li>aashishsah005@gmail.com</li>
                </ul>
            </div>
        </div>


        {/* ---------copyright---------- */}
        <div>
            <hr />
            <p className='py-5 text-sm text-center'>Copyright ©2026 BetterHealth - All Rights Reserved.</p>
        </div>
    </div>
  )
}

export default Footer