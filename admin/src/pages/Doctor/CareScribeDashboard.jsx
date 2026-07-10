import React, { useContext, useEffect, useState } from 'react';
import { DoctorContext } from '../../context/DoctorContext';
import { AppContext } from '../../context/AppContext';
import { SocketContext } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const CareScribeDashboard = () => {
    const { dToken, backendUrl } = useContext(DoctorContext);
    const { slotDateFormat } = useContext(AppContext);
    const { socket } = useContext(SocketContext);
    const navigate = useNavigate();

    const [consultations, setConsultations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterUrgency, setFilterUrgency] = useState('All');
    const [realtimeAlert, setRealtimeAlert] = useState(null);

    const fetchConsultations = async () => {
        if (!dToken) return;
        try {
            setLoading(true);
            const { data } = await axios.get(backendUrl + '/api/doctor/consultations/list', {
                headers: { dtoken: dToken }
            });
            if (data.success) {
                setConsultations(data.consultations);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConsultations();
    }, [dToken]);

    // Socket.IO listener for real-time triage updates
    useEffect(() => {
        if (!socket) return;

        const handleNewTriage = (data) => {
            console.log('[CareScribeDashboard] Socket alert received:', data);
            
            // Set active banner alert
            setRealtimeAlert({
                consultationId: data.consultationId,
                patientName: data.patientName,
                urgencyLevel: data.urgencyLevel,
                reasoning: data.reasoning
            });

            // Refresh list
            fetchConsultations();
        };

        socket.on('new-triage-flag', handleNewTriage);

        return () => {
            socket.off('new-triage-flag', handleNewTriage);
        };
    }, [socket]);

    const filteredConsultations = consultations.filter((con) => {
        if (filterUrgency === 'All') return true;
        return con.triage?.urgencyLevel === filterUrgency;
    });

    const getUrgencyBadge = (level) => {
        switch (level) {
            case 'High':
                return 'bg-red-50 text-red-700 border-red-200';
            case 'Medium':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Low':
                return 'bg-green-50 text-green-700 border-green-200';
            default:
                return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className='w-full max-w-6xl m-5 relative space-y-6'>
            {/* Urgency Alert Banner */}
            {realtimeAlert && (
                <div className="bg-red-600 text-white p-4 rounded-xl shadow-md flex flex-col md:flex-row md:items-center gap-4 justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-bold text-base">High Urgency Alert: New triage flag for Patient {realtimeAlert.patientName}</p>
                            <p className="text-sm opacity-90">{realtimeAlert.reasoning}</p>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button 
                            onClick={() => navigate(`/doctor-consultation/${realtimeAlert.consultationId}`)} 
                            className="bg-white text-red-700 hover:bg-zinc-100 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 shadow"
                        >
                            Review Now
                        </button>
                        <button 
                            onClick={() => setRealtimeAlert(null)} 
                            className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Page Title & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-800">CareScribe AI Consultations</h2>
                    <p className="text-sm text-zinc-500">Review and manage clinical transcriptions, SOAP documentation, and RAG-grounded triage flags.</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between bg-white border border-zinc-200 rounded-xl p-2 max-w-md">
                <button
                    onClick={() => setFilterUrgency('All')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterUrgency === 'All' ? 'bg-primary text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                >
                    All
                </button>
                <button
                    onClick={() => setFilterUrgency('High')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filterUrgency === 'High' ? 'bg-red-600 text-white' : 'text-zinc-500 hover:bg-red-50'}`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 border border-white"></span> High Urgency
                </button>
                <button
                    onClick={() => setFilterUrgency('Medium')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filterUrgency === 'Medium' ? 'bg-amber-500 text-white' : 'text-zinc-500 hover:bg-amber-50'}`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 border border-white"></span> Medium
                </button>
                <button
                    onClick={() => setFilterUrgency('Low')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filterUrgency === 'Low' ? 'bg-green-600 text-white' : 'text-zinc-500 hover:bg-green-50'}`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 border border-white"></span> Low Urgency
                </button>
            </div>

            {/* Consultations Table */}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-zinc-500 font-medium">Loading consultations history...</p>
                    </div>
                ) : filteredConsultations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <span className="text-4xl mb-3">🎙️</span>
                        <h4 className="font-semibold text-zinc-800">No Consultations Found</h4>
                        <p className="text-sm text-zinc-500 max-w-sm mt-1">Select an active patient appointment and start recording audio to trigger the CareScribe AI pipeline.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200">
                                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Patient</th>
                                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Date & Time</th>
                                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">AI Triage Urgency</th>
                                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {filteredConsultations.map((item) => (
                                    <tr key={item._id} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img className="w-9 h-9 rounded-full object-cover border border-zinc-200" src={item.patientData?.image || "https://via.placeholder.com/150"} alt="" />
                                                <div>
                                                    <p className="font-semibold text-zinc-800">{item.patientData?.name}</p>
                                                    <p className="text-xs text-zinc-500">Gender: {item.patientData?.gender || 'Not Selected'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-zinc-600 font-medium">
                                            {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, {new Date(item.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${getUrgencyBadge(item.triage?.urgencyLevel)}`}>
                                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                                {item.triage?.urgencyLevel} {item.triage?.clinicianOverridden && "(Override)"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.status === 'Processing' ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                                    <span className="text-xs text-zinc-500 font-semibold">Processing...</span>
                                                </div>
                                            ) : item.status === 'Pending Review' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full">
                                                    ⏰ Review Pending
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold bg-green-50 border border-green-150 px-2 py-0.5 rounded-full">
                                                    ✅ Completed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => navigate(`/doctor-consultation/${item._id}`)}
                                                className={`text-sm font-semibold hover:underline ${item.status === 'Processing' ? 'text-zinc-400 cursor-not-allowed' : 'text-primary'}`}
                                                disabled={item.status === 'Processing'}
                                            >
                                                Review SOAP Note
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CareScribeDashboard;
