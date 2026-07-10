import React, { useContext, useEffect, useState, useRef } from 'react';
import { DoctorContext } from '../../context/DoctorContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const NewConsultation = () => {
    const { dToken, backendUrl, appointments, getAppointments } = useContext(DoctorContext);
    const navigate = useNavigate();

    const [selectedApptId, setSelectedApptId] = useState('');
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [timer, setTimer] = useState(0);
    const [processing, setProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState(0);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerIntervalRef = useRef(null);
    const streamRef = useRef(null);

    // Audio Visualizer refs
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);

    useEffect(() => {
        if (dToken) {
            getAppointments();
        }
    }, [dToken]);

    useEffect(() => {
        if (selectedApptId) {
            const appt = appointments.find(a => a._id === selectedApptId);
            setSelectedAppt(appt);
        } else {
            setSelectedAppt(null);
        }
    }, [selectedApptId, appointments]);

    // Handle audio visualization
    const startVisualizer = (stream) => {
        try {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);
            analyserRef.current.fftSize = 256;

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const canvas = canvasRef.current;
            const canvasCtx = canvas.getContext('2d');

            const draw = () => {
                if (!canvas) return;
                const width = canvas.width;
                const height = canvas.height;

                animationFrameRef.current = requestAnimationFrame(draw);
                analyserRef.current.getByteFrequencyData(dataArray);

                canvasCtx.fillStyle = '#fcf8fa';
                canvasCtx.fillRect(0, 0, width, height);

                const barWidth = (width / bufferLength) * 2.5;
                let barHeight;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] / 1.5;

                    // Draw symmetrically from center
                    canvasCtx.fillStyle = `rgba(16, 185, 129, ${0.4 + barHeight / 150})`;
                    canvasCtx.fillRect(x, height / 2 - barHeight / 2, barWidth, barHeight);

                    x += barWidth + 1;
                }
            };

            draw();
        } catch (e) {
            console.warn("Visualizer init failed:", e);
        }
    };

    const stopVisualizer = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
        }
    };

    const startRecording = async () => {
        if (!selectedApptId) {
            toast.error("Please select a patient appointment first");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            audioChunksRef.current = [];

            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                await uploadAndProcessAudio();
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setIsPaused(false);
            setTimer(0);

            timerIntervalRef.current = setInterval(() => {
                setTimer((prev) => prev + 1);
            }, 1000);

            startVisualizer(stream);
        } catch (err) {
            console.error(err);
            toast.error("Microphone access is required to record consultations");
        }
    };

    const pauseRecording = () => {
        if (!mediaRecorderRef.current) return;

        if (isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerIntervalRef.current = setInterval(() => {
                setTimer((prev) => prev + 1);
            }, 1000);
        } else {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            clearInterval(timerIntervalRef.current);
        }
    };

    const stopRecording = () => {
        if (!mediaRecorderRef.current) return;
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        clearInterval(timerIntervalRef.current);
        stopVisualizer();
        
        // Stop audio tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
    };

    const uploadAndProcessAudio = async () => {
        setProcessing(true);
        setProcessingStep(0);

        // Simulation steps for user visual feedback
        const stepInterval = setInterval(() => {
            setProcessingStep((prev) => (prev < 2 ? prev + 1 : prev));
        }, 12000);

        try {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', audioBlob, 'consultation_recording.webm');
            formData.append('appointmentId', selectedApptId);

            const { data } = await axios.post(backendUrl + '/api/doctor/consultations/create', formData, {
                headers: {
                    dtoken: dToken,
                    'Content-Type': 'multipart/form-data'
                }
            });

            clearInterval(stepInterval);

            if (data.success) {
                toast.success(data.message);
                navigate(`/doctor-consultation/${data.consultationId}`);
            } else {
                toast.error(data.message);
                setProcessing(false);
            }
        } catch (error) {
            clearInterval(stepInterval);
            console.error(error);
            toast.error(error.response?.data?.message || error.message);
            setProcessing(false);
        }
    };

    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    // Filter only incomplete and uncancelled appointments
    const activeAppointments = appointments.filter(appt => !appt.cancelled && !appt.isCompleted);

    return (
        <div className="w-full max-w-6xl m-5 relative space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-zinc-800">New Consultation Intake</h2>
                <p className="text-sm text-zinc-500">Record clinical conversations to automatically generate transcripts, SOAP notes, and triage flags.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Patient Selection Card */}
                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-zinc-800 mb-4">Patient Selection</h3>
                    <label className="text-xs font-bold text-zinc-500 uppercase mb-2">Select Active Appointment</label>
                    <select
                        value={selectedApptId}
                        onChange={(e) => setSelectedApptId(e.target.value)}
                        disabled={isRecording}
                        className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-zinc-50"
                    >
                        <option value="">-- Choose Patient Appointment --</option>
                        {activeAppointments.map((appt) => (
                            <option key={appt._id} value={appt._id}>
                                {appt.userData?.name} ({appt.slotDate} @ {appt.slotTime})
                            </option>
                        ))}
                    </select>

                    {selectedAppt && (
                        <div className="mt-6 p-4 bg-zinc-50 border border-zinc-200 rounded-lg space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                                    {selectedAppt.userData?.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-800">{selectedAppt.userData?.name}</p>
                                    <p className="text-xs text-zinc-500">MRN: #CS-{selectedAppt._id.slice(-6)}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-200 text-sm">
                                <div>
                                    <p className="text-xs text-zinc-400 font-bold uppercase">Age</p>
                                    <p className="font-medium text-zinc-700">{selectedAppt.userData?.dob && selectedAppt.userData.dob !== 'Not Selected' ? (new Date().getFullYear() - new Date(selectedAppt.userData.dob).getFullYear()) : 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-400 font-bold uppercase">Gender</p>
                                    <p className="font-medium text-zinc-700">{selectedAppt.userData?.gender}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Recorder Control Panel */}
                <div className="md:col-span-2 bg-white p-8 rounded-xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden min-h-[350px]">
                    <div className="w-full flex justify-between items-center mb-6">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-zinc-800">Consultation Recorder</h3>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${isRecording ? 'bg-red-50 text-red-700 border-red-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-zinc-400'}`}></span>
                                {isRecording ? 'LIVE' : 'INACTIVE'}
                            </span>
                        </div>
                        <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </svg>
                            Mic Active
                        </span>
                    </div>

                    {/* Microphone Pulse Circle */}
                    <div 
                        onClick={isRecording ? stopRecording : startRecording} 
                        className={`w-28 h-28 rounded-full flex items-center justify-center cursor-pointer shadow-md transition-all duration-300 relative ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-primary text-white hover:opacity-90'}`}
                    >
                        {isRecording ? (
                            // Stop icon
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                                <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                            </svg>
                        ) : (
                            // Mic icon
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </svg>
                        )}
                        {isRecording && (
                            <div className="absolute inset-0 bg-red-600 rounded-full opacity-15 scale-125 animate-ping"></div>
                        )}
                    </div>

                    {/* Digital Timer */}
                    <div className="mt-6 text-3xl font-bold tracking-tight text-zinc-700 tabular-nums">
                        {formatTimer(timer)}
                    </div>

                    {/* Procedural Canvas Waveform */}
                    <div className="w-full h-24 my-6 rounded-lg bg-zinc-50 overflow-hidden relative border border-zinc-200">
                        <canvas ref={canvasRef} width="600" height="96" className="w-full h-full" />
                        {!isRecording && (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-bold uppercase tracking-wider bg-zinc-50/50">
                                Waiting for Audio Input
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-4 w-full max-w-sm mt-2">
                        {isRecording && (
                            <button
                                onClick={pauseRecording}
                                className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg text-sm font-semibold hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2"
                            >
                                {isPaused ? (
                                    <>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Resume
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                                        Pause
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`flex-[2] px-4 py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 ${isRecording ? 'bg-red-600' : 'bg-primary'}`}
                        >
                            {isRecording ? 'Stop & Process Note' : 'Start Recording'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Glassmorphic Processing Overlay */}
            {processing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-md transition-opacity duration-300">
                    <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl border border-zinc-200 flex flex-col items-center">
                        <div className="w-16 h-16 mb-6 relative">
                            <div className="absolute inset-0 rounded-full border-4 border-zinc-100"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#5b6cf6' }}>
                                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.66z"></path>
                                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.66z"></path>
                                </svg>
                            </div>
                        </div>
                        
                        <h2 className="text-xl font-bold text-zinc-800 mb-4">CareScribe AI is processing...</h2>
                        
                        <div className="w-full space-y-3 bg-zinc-50 p-4 rounded-lg border border-zinc-200 font-mono text-[13px] text-zinc-600">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${processingStep >= 0 ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`}></span>
                                <span className={processingStep === 0 ? 'font-bold text-zinc-800' : ''}>Transcribing clinical dialogue...</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${processingStep >= 1 ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`}></span>
                                <span className={processingStep === 1 ? 'font-bold text-zinc-800' : ''}>Retrieving guidelines & classifying triage...</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${processingStep >= 2 ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`}></span>
                                <span className={processingStep === 2 ? 'font-bold text-zinc-800' : ''}>Structuring SOAP medical records...</span>
                            </div>
                        </div>
                        
                        <p className="text-xs text-zinc-400 italic mt-6">This typically takes 20-30 seconds.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewConsultation;
