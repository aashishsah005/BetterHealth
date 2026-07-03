import React, { useContext, useEffect, useState } from 'react'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useNavigate, useLocation } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'

const Login = () => {

  const {backendUrl,token,setToken}=useContext(AppContext)
  const navigate=useNavigate()
  const location=useLocation()

  const [state,setState]=useState('Sign Up')

  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [name,setName]=useState('')
  const [otp,setOtp]=useState('')
  const [requireOTP,setRequireOTP]=useState(false)
  
  const onSubmitHandler=async(event)=>{
    event?.preventDefault?.()
    try{
      if (requireOTP && event?.type === 'submit') {
        // Handle OTP Verification
        const {data}=await axios.post(backendUrl+'/api/user/verify-otp',{email,otp})
        if(data.success){
          localStorage.setItem('token',data.token)
          setToken(data.token)
          toast.success("Success")
        }
        else{
          toast.error(data.message)
        }
      } else {
        // Handle initial signup/login or resend
        const isResend = event?.type === 'resend';
        const endpoint = (state === 'Sign Up' && !isResend) ? '/api/user/register' : '/api/user/login';
        const payload = (state === 'Sign Up' && !isResend) ? { name, email, password } : { email, password };
        const { data } = await axios.post(backendUrl + endpoint, payload);
        
        if (data.success && data.requireOTP) {
          setRequireOTP(true);
          toast.success(data.message);
        } else if (data.success) {
          localStorage.setItem('token', data.token);
          setToken(data.token);
          toast.success("Success");
        } else {
          toast.error(data.message);
        }
      }
    } catch(error){
      toast.error(error.message)
    }

  }

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const { data } = await axios.post(backendUrl + '/api/user/google-login', { token: credentialResponse.credential })
      if (data.success) {
        localStorage.setItem('token', data.token)
        setToken(data.token)
        toast.success("Login Successful")
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(()=>{
    if(token){
      const destination = location.state?.from || '/'
      navigate(destination)
    }
  },[token])

  return (
    <form onSubmit={onSubmitHandler} className='min-h-[80vh] flex items-center'>
      <div className='flex flex-col gap-3 m-auto items-start p-8 min-w-[340px] sm:min-w-96 border rounded-xl text-zinc-600 text-sm shadow-lg bg-white'>
        <p className='text-2xl font-semibold'>{state==='Sign Up' ? "Create Account" : (requireOTP ? "Enter OTP" : "Login")}</p>
        <p>Please {state==='Sign Up' ? "sign up" : (requireOTP ? "enter the OTP sent to your email" : "log in")} to book appointment</p>
        
        { !requireOTP && state==="Sign Up" && <div className='w-full'>
            <p>Full Name</p>
            <input className='border border-zinc-300 rounded w-full p-2 mt-1' type="text" onChange={(e)=>setName(e.target.value)} value={name} required/>
          </div>
        }
        
        { !requireOTP && <div className='w-full'>
          <p>Email</p>
          <input className='border border-zinc-300 rounded w-full p-2 mt-1' type="email" onChange={(e)=>setEmail(e.target.value)} value={email} required/>
        </div> }

        { !requireOTP && <div className='w-full'>
          <p>Password</p>
          <input className='border border-zinc-300 rounded w-full p-2 mt-1' type="password" onChange={(e)=>setPassword(e.target.value)} value={password} required/>
        </div> }

        { requireOTP && <div className='w-full'>
          <p>OTP</p>
          <input className='border border-zinc-300 rounded w-full p-2 mt-1' type="text" onChange={(e)=>setOtp(e.target.value)} value={otp} required placeholder="Enter 6-digit OTP"/>
        </div> }

        <button type='submit' className='bg-primary text-white w-full py-2 rounded-md text-base'>{state==='Sign Up' ? "Create Account" : (requireOTP ? "Verify OTP" : "Login")}</button>
        
        { !requireOTP && (
          <div className="w-full flex justify-center mt-2">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => {
                toast.error('Google Sign In Failed');
              }}
            />
          </div>
        )}

        {
          state==="Sign Up"
          ? <p>Already have an account? <span onClick={()=>{setState('Login'); setRequireOTP(false);}} className='text-primary underline cursor-pointer'>Login here</span></p>
          : <p>{requireOTP ? "Didn't receive code? " : "Create an account? "}<span onClick={()=>{if(requireOTP) { onSubmitHandler(new Event('resend')) } else { setState('Sign Up'); setRequireOTP(false); }}} className='text-primary underline cursor-pointer'>{requireOTP ? "Resend" : "Click here"}</span></p>
        }
      </div>
    </form>
  )
}

export default Login