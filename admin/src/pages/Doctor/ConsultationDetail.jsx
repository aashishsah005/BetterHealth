import React, { useContext, useEffect, useState } from 'react';
import { DoctorContext } from '../../context/DoctorContext';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const ConsultationDetail = () => {
    const { dToken, backendUrl } = useContext(DoctorContext);
    const { id } = useParams(); // consultationId
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);
    const [consultation, setConsultation] = useState(null);
    const [transcript, setTranscript] = useState('');
    const [note, setNote] = useState({ subjective: '', objective: '', assessment: '', plan: '', clinicianApproved: false });
    const [triage, setTriage] = useState({ urgencyLevel: 'Low', reasoning: '', guidelineSource: '' });
    const [reportUrl, setReportUrl] = useState(null);

    // Editing states for SOAP fields
    const [isEditingSubjective, setIsEditingSubjective] = useState(false);
    const [isEditingObjective, setIsEditingObjective] = useState(false);
    const [isEditingAssessment, setIsEditingAssessment] = useState(false);
    const [isEditingPlan, setIsEditingPlan] = useState(false);

    // Override states
    const [selectedUrgency, setSelectedUrgency] = useState('Low');
    const [overrideReason, setOverrideReason] = useState('');
    const [showOverridePanel, setShowOverridePanel] = useState(false);

    const fetchConsultationDetail = async () => {
        if (!dToken) return;
        try {
            setLoading(true);
            const { data } = await axios.get(`${backendUrl}/api/doctor/consultations/${id}`, {
                headers: { dtoken: dToken }
            });
            if (data.success) {
                setConsultation(data.consultation);
                setTranscript(data.transcript);
                if (data.note) setNote(data.note);
                if (data.triage) {
                    setTriage(data.triage);
                    setSelectedUrgency(data.triage.clinicianOverrideValue || data.triage.urgencyLevel);
                    setShowOverridePanel(data.triage.clinicianOverridden);
                }
                if (data.consultation?.reportUrl) setReportUrl(data.consultation.reportUrl);
            } else {
                toast.error(data.message);
                navigate('/doctor-consultations');
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConsultationDetail();
    }, [id, dToken]);

    const handleSaveNote = async (approve = false) => {
        try {
            const payload = {
                ...note,
                clinicianApproved: approve ? true : note.clinicianApproved
            };

            const { data } = await axios.put(`${backendUrl}/api/doctor/consultations/${id}/note`, payload, {
                headers: { dtoken: dToken }
            });

            if (data.success) {
                setNote(data.note);
                if (approve) {
                    toast.success("SOAP Draft saved. Click 'Approve & Generate Report' to finalize.");
                } else {
                    toast.success("SOAP draft saved");
                    setIsEditingSubjective(false);
                    setIsEditingObjective(false);
                    setIsEditingAssessment(false);
                    setIsEditingPlan(false);
                }
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message);
        }
    };

    const handleApproveAndGenerate = async () => {
        if (approving) return;
        try {
            setApproving(true);
            // First save current SOAP edits
            await axios.put(`${backendUrl}/api/doctor/consultations/${id}/note`, {
                ...note,
                clinicianApproved: true
            }, { headers: { dtoken: dToken } });

            // Then call approve endpoint: generates PDF + sends in chat
            const { data } = await axios.post(
                `${backendUrl}/api/doctor/consultations/${id}/approve`,
                {},
                { headers: { dtoken: dToken } }
            );

            if (data.success) {
                setNote(prev => ({ ...prev, clinicianApproved: true }));
                if (data.reportUrl) setReportUrl(data.reportUrl);
                toast.success('Consultation approved! PDF report generated and sent to patient.');
                await fetchConsultationDetail();
            } else {
                toast.error(data.message || 'Approval failed');
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message);
        } finally {
            setApproving(false);
        }
    };

    const handleSaveOverride = async () => {
        if (selectedUrgency === triage.urgencyLevel && !triage.clinicianOverridden) {
            toast.info("Triage urgency matches AI. No changes made.");
            return;
        }

        try {
            const { data } = await axios.put(`${backendUrl}/api/doctor/consultations/${id}/triage`, {
                urgencyLevel: selectedUrgency,
                reason: overrideReason
            }, {
                headers: { dtoken: dToken }
            });

            if (data.success) {
                setTriage(data.triage);
                toast.success("Triage urgency level updated");
                setShowOverridePanel(true);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message);
        }
    };

    const getUrgencyColor = (level) => {
        switch (level) {
            case 'High': return 'bg-red-600 text-white';
            case 'Medium': return 'bg-amber-500 text-white';
            case 'Low': return 'bg-green-600 text-white';
            default: return 'bg-zinc-500 text-white';
        }
    };

    const formatSpeakers = (text) => {
        if (!text) return [];
        return text.split('\n').map((line, idx) => {
            const isDoctor = line.startsWith('Doctor:') || line.startsWith('doctor:');
            const speaker = isDoctor ? 'Doctor (You)' : 'Patient';
            const cleanText = line.replace(/^(Doctor|Patient|doctor|patient):\s*/i, '');
            return { speaker, cleanText, isDoctor, key: idx };
        }).filter(item => item.cleanText.trim() !== '');
    };

    if (loading) {
        return (
            <div className="w-full flex flex-col items-center justify-center min-h-[75vh] gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-zinc-500 font-medium">Analyzing encounter transcription details...</p>
            </div>
        );
    }

    const speakerTurns = formatSpeakers(transcript);

    return (
        <div className="w-full max-w-6xl m-5 relative flex flex-col h-[85vh] overflow-hidden gap-4">
            {/* Page Header */}
            <div className="flex justify-between items-center bg-white p-4 border border-zinc-200 rounded-xl shadow-sm shrink-0">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <span className="cursor-pointer hover:underline" onClick={() => navigate('/doctor-consultations')}>Consultations</span>
                    <span>➡️</span>
                    <span className="font-bold text-zinc-800">{consultation?.patientData?.name} ({new Date(consultation?.date).toLocaleDateString()})</span>
                </div>
                <div className="flex items-center gap-3">
                    {consultation?.isMedical !== false && (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${getUrgencyColor(triage.urgencyLevel)}`}>
                            {triage.urgencyLevel} Urgency
                        </span>
                    )}
                    {note.clinicianApproved && (
                        <span className="bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-xs font-bold">
                            Finalized
                        </span>
                    )}
                </div>
            </div>

            {/* Main Split Grid */}
            <div className="flex-1 flex gap-5 overflow-hidden">
                {/* Left Column: Transcript Feed (40% if medical, 50% if non-medical) */}
                <div className={`${consultation?.isMedical !== false ? 'w-[40%]' : 'w-[50%]'} flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm`}>
                    <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between shrink-0">
                        <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                            📝 Encounter Transcript
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/20">
                        {speakerTurns.length === 0 ? (
                            <p className="text-sm text-zinc-400 italic text-center py-8">No transcript text processed.</p>
                        ) : (
                            speakerTurns.map((turn) => (
                                <div key={turn.key} className={`flex flex-col max-w-[85%] ${turn.isDoctor ? 'ml-auto items-end' : 'items-start'}`}>
                                    <span className="text-[10px] font-bold text-zinc-400 mb-1 px-1">{turn.speaker}</span>
                                    <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${turn.isDoctor ? 'bg-zinc-800 text-white rounded-tr-none' : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-none'}`}>
                                        {turn.cleanText}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: SOAP Editor & Triage Panel (60% if medical, 50% if non-medical) */}
                <div className={`${consultation?.isMedical !== false ? 'w-[60%]' : 'w-[50%]'} flex flex-col gap-4 overflow-y-auto pr-1`}>
                    {consultation?.isMedical !== false ? (
                        <>
                            {/* AI Triage Card */}
                            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm shrink-0">
                                <div className="px-5 py-4 border-b border-zinc-200 bg-red-50/25 flex items-center justify-between">
                                    <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                                        🤖 AI Triage Copilot
                                    </h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getUrgencyColor(triage.urgencyLevel)}`}>
                                        {triage.urgencyLevel} Urgency
                                    </span>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-400 uppercase">AI Rationale</label>
                                        <p className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-150 p-3 rounded-lg mt-1 leading-relaxed">
                                            {triage.reasoning}
                                        </p>
                                    </div>
                                    
                                    {triage.guidelineSource && (
                                        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex gap-3 text-xs leading-relaxed text-zinc-600">
                                            <span className="text-base shrink-0">📖</span>
                                            <div>
                                                <p className="font-bold text-zinc-500 uppercase tracking-wide">Guideline Citation Reference</p>
                                                <p className="mt-1 italic">{triage.guidelineSource}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Override Form */}
                                    <div className="pt-2 border-t border-zinc-100 flex flex-col md:flex-row gap-4 items-end">
                                        <div className="flex-1 w-full">
                                            <label className="text-xs font-bold text-zinc-400 uppercase">Clinician Triage Verification</label>
                                            <select
                                                value={selectedUrgency}
                                                onChange={(e) => setSelectedUrgency(e.target.value)}
                                                disabled={note.clinicianApproved}
                                                className="w-full border border-zinc-200 rounded-lg p-2 text-sm mt-1 focus:ring-primary focus:border-primary disabled:bg-zinc-50"
                                            >
                                                <option value="High">High Urgency</option>
                                                <option value="Medium">Medium Urgency</option>
                                                <option value="Low">Low Urgency</option>
                                            </select>
                                        </div>
                                        <div className="flex-[2] w-full">
                                            <label className="text-xs font-bold text-zinc-400 uppercase">Override Justification (Required if altered)</label>
                                            <input
                                                value={overrideReason}
                                                onChange={(e) => setOverrideReason(e.target.value)}
                                                disabled={note.clinicianApproved}
                                                type="text"
                                                placeholder="Explain clinical reasoning..."
                                                className="w-full border border-zinc-200 rounded-lg p-2 text-sm mt-1 focus:ring-primary focus:border-primary disabled:bg-zinc-50"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSaveOverride}
                                            disabled={note.clinicianApproved}
                                            className="bg-zinc-800 text-white font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-zinc-700 disabled:bg-zinc-150 transition-colors"
                                        >
                                            Verify
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* SOAP Note Form */}
                            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
                                <h3 className="text-lg font-bold text-zinc-800 border-b border-zinc-100 pb-2">Structured SOAP Note</h3>
                                
                                {/* Subjective */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Subjective (S)</label>
                                        <button 
                                            onClick={() => setIsEditingSubjective(!isEditingSubjective)}
                                            disabled={note.clinicianApproved}
                                            className="text-xs text-primary font-bold hover:underline"
                                        >
                                            {isEditingSubjective ? 'View Mode' : '✏️ Edit'}
                                        </button>
                                    </div>
                                    {isEditingSubjective ? (
                                        <textarea
                                            value={note.subjective}
                                            onChange={(e) => setNote({ ...note, subjective: e.target.value })}
                                            className="w-full h-28 border border-zinc-200 rounded-lg p-3 text-sm focus:ring-primary focus:border-primary"
                                        />
                                    ) : (
                                        <p className="text-sm text-zinc-700 bg-zinc-50 p-3 rounded-lg border border-zinc-100 leading-relaxed min-h-12 whitespace-pre-line">
                                            {note.subjective || 'No subjective observations.'}
                                        </p>
                                    )}
                                </div>

                                {/* Objective */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Objective (O)</label>
                                        <button 
                                            onClick={() => setIsEditingObjective(!isEditingObjective)}
                                            disabled={note.clinicianApproved}
                                            className="text-xs text-primary font-bold hover:underline"
                                        >
                                            {isEditingObjective ? 'View Mode' : '✏️ Edit'}
                                        </button>
                                    </div>
                                    {isEditingObjective ? (
                                        <textarea
                                            value={note.objective}
                                            onChange={(e) => setNote({ ...note, objective: e.target.value })}
                                            className="w-full h-28 border border-zinc-200 rounded-lg p-3 text-sm focus:ring-primary focus:border-primary"
                                        />
                                    ) : (
                                        <p className="text-sm text-zinc-700 bg-zinc-50 p-3 rounded-lg border border-zinc-100 leading-relaxed min-h-12 whitespace-pre-line">
                                            {note.objective || 'No objective values recorded.'}
                                        </p>
                                    )}
                                </div>

                                {/* Assessment */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Assessment (A)</label>
                                        <button 
                                            onClick={() => setIsEditingAssessment(!isEditingAssessment)}
                                            disabled={note.clinicianApproved}
                                            className="text-xs text-primary font-bold hover:underline"
                                        >
                                            {isEditingAssessment ? 'View Mode' : '✏️ Edit'}
                                        </button>
                                    </div>
                                    {isEditingAssessment ? (
                                        <textarea
                                            value={note.assessment}
                                            onChange={(e) => setNote({ ...note, assessment: e.target.value })}
                                            className="w-full h-28 border border-zinc-200 rounded-lg p-3 text-sm focus:ring-primary focus:border-primary"
                                        />
                                    ) : (
                                        <p className="text-sm text-zinc-700 bg-zinc-50 p-3 rounded-lg border border-zinc-100 leading-relaxed min-h-12 whitespace-pre-line">
                                            {note.assessment || 'No clinical assessment draft.'}
                                        </p>
                                    )}
                                </div>

                                {/* Plan */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Plan (P)</label>
                                        <button 
                                            onClick={() => setIsEditingPlan(!isEditingPlan)}
                                            disabled={note.clinicianApproved}
                                            className="text-xs text-primary font-bold hover:underline"
                                        >
                                            {isEditingPlan ? 'View Mode' : '✏️ Edit'}
                                        </button>
                                    </div>
                                    {isEditingPlan ? (
                                        <textarea
                                            value={note.plan}
                                            onChange={(e) => setNote({ ...note, plan: e.target.value })}
                                            className="w-full h-28 border border-zinc-200 rounded-lg p-3 text-sm focus:ring-primary focus:border-primary"
                                        />
                                    ) : (
                                        <p className="text-sm text-zinc-700 bg-zinc-50 p-3 rounded-lg border border-zinc-100 leading-relaxed min-h-12 whitespace-pre-line">
                                            {note.plan || 'No patient action plan.'}
                                        </p>
                                    )}
                                </div>

                                {/* Footer: action buttons */}
                                {!note.clinicianApproved && (
                                    <div className="pt-4 border-t border-zinc-100 flex gap-4">
                                        <button
                                            onClick={() => handleSaveNote(false)}
                                            className="flex-1 py-3 bg-zinc-100 text-zinc-700 font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
                                        >
                                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                            Save Draft
                                        </button>
                                        <button
                                            onClick={handleApproveAndGenerate}
                                            disabled={approving}
                                            className="flex-[2] py-3 bg-primary text-white font-semibold rounded-lg hover:opacity-95 transition-opacity flex items-center justify-center gap-2 disabled:opacity-70"
                                        >
                                            {approving ? (
                                                <>
                                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }}></div>
                                                    Generating Report...
                                                </>
                                            ) : (
                                                <>
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    Approve &amp; Generate Report
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Approved state — show PDF link */}
                                {note.clinicianApproved && (
                                    <div className="pt-4 border-t border-zinc-100 space-y-3">
                                        <div className="text-center text-xs text-green-600 font-bold bg-green-50 p-3 rounded-lg border border-green-200 flex items-center justify-center gap-2">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            Approved &amp; Locked — Patient EHR updated.
                                        </div>
                                        {reportUrl ? (
                                            <a
                                                href={reportUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-primary text-primary font-semibold rounded-lg hover:bg-primary/5 transition-colors text-sm"
                                            >
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                                View &amp; Download PDF Report
                                            </a>
                                        ) : (
                                            <p className="text-xs text-zinc-400 text-center">PDF report will appear here once generated.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* Non-clinical Notice Card */
                        <div className="bg-white border border-zinc-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
                            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-3xl animate-bounce">
                                ⚠️
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-zinc-850">No clinical assessment generated</h3>
                                <p className="text-sm text-zinc-600 max-w-md mx-auto font-medium">
                                    This consultation did not contain sufficient clinical information for AI-generated assessment.
                                </p>
                            </div>
                            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-150 text-xs text-zinc-500 max-w-md italic leading-relaxed">
                                <span className="font-bold not-italic text-zinc-600 block mb-1">Reason:</span>
                                The conversation does not contain sufficient medical information to perform a clinical evaluation.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConsultationDetail;
