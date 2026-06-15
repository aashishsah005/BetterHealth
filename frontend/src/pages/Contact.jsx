import React from 'react'
import { assets } from '../assets/assets'

const Contact = () => {
  return (
    <div>

      <div className='text-center text-2xl pt-10 text-gray-500'>
        <p>Contact <span className='text-gray-700 font-semibold'>US</span></p>  
      </div>

      <div className='my-10 flex flex-col justify-center md:flex-row gap-10 mb-28 text-sm'>
        <img className='w-full md:max-w-[360px]' src={assets.contact_image} alt="" />
        
        <div className='flex flex-col justify-center items-start gap-6'>
          <p className='font-semibold text-lg text-gray-600'>Our OFFICE</p>
          <p className='text-gray-500'>Ganpat Vidyanagar, Mehsana-Gandhinagar Highway <br />Kherva, Gujarat 384012</p>
          <p className='text-gray-500'>Tel: +91 9608449927<br />Email: aashishsah005@gmail.com</p>
          <p className='font-semibold text-lg text-gray-500'>Carrier at BetterHealth</p>
          <p className='text-gray-500'>Learn more about out teams and job openinhs.</p>
          <button className='border border-black px-8 py-4 text-sm hover:text-white transition-all duration-500'>Explore Jobs</button>
        </div>
      
      </div>

    </div>
  )
}

export default Contact