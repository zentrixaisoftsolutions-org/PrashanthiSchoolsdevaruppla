import React, { useState, useRef, useEffect } from 'react';
import {
  FiMessageSquare, FiX, FiSend, FiMinimize2, FiMaximize2,
  FiUser, FiCpu, FiChevronDown, FiHelpCircle,
} from 'react-icons/fi';
import { FaRobot, FaUserGraduate, FaMoneyBillWave, FaClipboardList, FaCalendarCheck, FaChalkboardTeacher } from 'react-icons/fa';
import chatService, { ChatResponse } from '../services/chatService';
import { TicketModal } from './HelpDesk';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tool_used?: string | null;
  suggestions?: string[] | null;
  data?: any;
  loading?: boolean;
}

const WELCOME_MSG = `Hello! I'm your School ERP assistant. I can help you with:

**1.** 🎓 **Student Details** — Search by name or admission number
**2.** 📋 **Attendance History** — Check attendance for any period
**3.** 📝 **Marks & Assessment** — View exam results and grades
**4.** 💰 **Fee Details** — Check fee status, payments & dues
**5.** 👨‍🏫 **Staff Details** — Subjects, classes & attendance
**6.** 📚 **Know Your App** — Complete guide to every feature

Just type your query below or try one of the suggestions!`;

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: WELCOME_MSG,
      timestamp: new Date(),
      data: { card_type: 'welcome' },
      suggestions: [
        'student details of <admission_no>',
        'attendance of <student> last 30 days',
        'marks of <student>',
        'fees of <student>',
        'staff details of <name>',
        'Know Your App',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    const loadingMsg: Message = {
      id: Date.now() + 1,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response: ChatResponse = await chatService.sendMessage(messageText);
      setMessages(prev =>
        prev.map(m =>
          m.loading
            ? {
                ...m,
                content: response.reply,
                tool_used: response.tool_used,
                suggestions: response.suggestions,
                data: response.data,
                loading: false,
              }
            : m
        )
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.loading
            ? {
                ...m,
                content: '❌ Sorry, something went wrong. Please try again.',
                loading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  // ==================== ADAPTIVE CARD RENDERERS ====================

  /** Render a plain text message (greetings, errors, simple replies) */
  const renderTextCard = (content: string) => {
    // Lightweight inline formatting only
    const html = content
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-300">$1</code>')
      .replace(/_([^_]+)_/g, '<em class="italic text-gray-400">$1</em>')
      .replace(/\n/g, '<br/>');
    return <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  /** Welcome card */
  const renderWelcomeCard = (content: string) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <FaRobot className="text-indigo-400" />
          <span className="font-bold text-white text-sm">School Assistant</span>
        </div>
        {renderTextCard(content)}
      </div>
    );
  };

  /** Student profile adaptive card */
  const renderStudentCard = (data: any) => {
    if (!data || !data.name) return null;
    const fields = [
      { label: 'Admission No', value: data.admission_number },
      { label: 'Class', value: data.class },
      { label: 'Gender', value: data.gender },
      { label: 'Date of Birth', value: data.date_of_birth },
      { label: 'Father/Guardian', value: data.father_guardian },
      { label: 'Mother', value: data.mother },
      { label: 'Mobile', value: data.mobile },
      { label: 'Email', value: data.email },
      { label: 'Blood Group', value: data.blood_group },
      { label: 'RFID', value: data.rfid },
    ].filter(f => f.value && f.value !== 'None' && f.value !== 'N/A');

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-lg px-3 py-2">
          <FaUserGraduate className="text-indigo-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.name}</div>
            <div className="text-[10px] text-gray-400">{data.class} • {data.admission_number}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {fields.map((f, i) => (
            <div key={i} className="text-[11px]">
              <span className="text-gray-500">{f.label}:</span>{' '}
              <span className="text-gray-200">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Student list card (multiple matches) */
  const renderStudentListCard = (data: any[], content: string) => {
    if (!data || !Array.isArray(data)) return renderTextCard(content);
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-400">🔍 Found <strong className="text-white">{data.length}</strong> students:</div>
        <div className="space-y-1">
          {data.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 text-[11px] border border-white/5">
              <FaUserGraduate className="text-indigo-400 text-xs flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium">{s.name}</span>
                <span className="text-gray-500 ml-2">Adm: {s.admission_number}</span>
                {s.class && <span className="text-gray-500 ml-2">• {s.class}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 italic">💡 Specify an exact admission number for detailed info.</div>
      </div>
    );
  };

  /** Attendance adaptive card */
  const renderAttendanceCard = (data: any, content: string) => {
    if (!data || !data.student_name) return renderTextCard(content);
    const pctColor = data.percentage >= 75 ? 'text-green-400' : data.percentage >= 50 ? 'text-yellow-400' : 'text-red-400';
    const pctBg = data.percentage >= 75 ? 'bg-green-500' : data.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-lg px-3 py-2">
          <FaCalendarCheck className="text-emerald-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.student_name}</div>
            <div className="text-[10px] text-gray-400">{data.class} • Last {data.period_days} days</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="px-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400">Attendance</span>
            <span className={`font-bold ${pctColor}`}>{data.percentage}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div className={`${pctBg} h-2 rounded-full transition-all`} style={{ width: `${Math.min(data.percentage, 100)}%` }} />
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'Working', value: data.working_days, color: 'text-blue-400' },
            { label: 'Present', value: data.present, color: 'text-green-400' },
            { label: 'Absent', value: data.absent, color: 'text-red-400' },
            { label: 'Late', value: data.late, color: 'text-yellow-400' },
          ].map((s, i) => (
            <div key={i} className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
              <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Fee summary adaptive card */
  const renderFeeCard = (data: any, content: string) => {
    if (!data || data.card_type !== 'fee_summary') return renderTextCard(content);
    const pctPaid = data.payment_percentage || 0;
    const pctColor = pctPaid >= 75 ? 'text-green-400' : pctPaid >= 50 ? 'text-yellow-400' : 'text-red-400';
    const pctBg = pctPaid >= 75 ? 'bg-green-500' : pctPaid >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg px-3 py-2">
          <FaMoneyBillWave className="text-amber-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.student_name}</div>
            <div className="text-[10px] text-gray-400">{data.class} • {data.academic_year}</div>
          </div>
        </div>
        {/* Fee totals */}
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-white/5 rounded-lg px-2 py-2 text-center">
            <div className="text-xs font-bold text-blue-400">₹{data.total_fee?.toLocaleString()}</div>
            <div className="text-[9px] text-gray-500">Total Fee</div>
          </div>
          <div className="bg-white/5 rounded-lg px-2 py-2 text-center">
            <div className="text-xs font-bold text-green-400">₹{data.total_paid?.toLocaleString()}</div>
            <div className="text-[9px] text-gray-500">Paid</div>
          </div>
          <div className="bg-white/5 rounded-lg px-2 py-2 text-center">
            <div className="text-xs font-bold text-red-400">₹{data.total_due?.toLocaleString()}</div>
            <div className="text-[9px] text-gray-500">Due</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="px-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400">Payment Progress</span>
            <span className={`font-bold ${pctColor}`}>{pctPaid}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div className={`${pctBg} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pctPaid, 100)}%` }} />
          </div>
        </div>
        {/* Fee breakdown */}
        {data.fee_breakdown && data.fee_breakdown.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1 px-1">Fee Breakdown</div>
            <div className="space-y-0.5">
              {data.fee_breakdown.map((fb: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded px-2 py-1 text-[11px]">
                  <span className="text-gray-300">{fb.fee_type}</span>
                  <div className="flex gap-3">
                    <span className="text-gray-500">₹{fb.amount?.toLocaleString()}</span>
                    {fb.due > 0 ? (
                      <span className="text-red-400 font-medium">Due: ₹{fb.due?.toLocaleString()}</span>
                    ) : (
                      <span className="text-green-400 font-medium">Paid ✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Recent payments */}
        {data.recent_payments && data.recent_payments.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1 px-1">Recent Payments</div>
            <div className="space-y-0.5">
              {data.recent_payments.slice(0, 4).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded px-2 py-1 text-[11px]">
                  <span className="text-gray-400">{p.date}</span>
                  <span className="text-white font-medium">₹{p.amount?.toLocaleString()}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    p.method === 'razorpay' ? 'bg-blue-500/20 text-blue-300' :
                    p.method === 'cash' ? 'bg-green-500/20 text-green-300' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>{p.method}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Marks / assessment adaptive card */
  const renderMarksCard = (data: any, content: string) => {
    if (!data || !data.exams) return renderTextCard(content);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-violet-500/20 to-pink-500/20 rounded-lg px-3 py-2">
          <FaClipboardList className="text-violet-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.student_name}</div>
            <div className="text-[10px] text-gray-400">{data.class}</div>
          </div>
        </div>
        {data.exams.map((exam: any, ei: number) => (
          <div key={ei} className="space-y-1">
            <div className="text-[11px] font-semibold text-indigo-300 px-1">📄 {exam.exam}</div>
            <div className="space-y-0.5">
              {exam.subjects?.map((sub: any, si: number) => {
                const passed = sub.status === 'Pass';
                return (
                  <div key={si} className="flex items-center justify-between bg-white/5 rounded px-2 py-1 text-[11px]">
                    <span className="text-gray-300 flex-1">{sub.subject}</span>
                    <span className="text-white font-medium w-12 text-right">{sub.marks}/{sub.max}</span>
                    <span className={`w-10 text-right text-[10px] font-medium ${passed ? 'text-green-400' : 'text-red-400'}`}>
                      {sub.grade || (sub.percentage != null ? `${sub.percentage}%` : 'AB')}
                    </span>
                    <span className={`w-4 text-right text-[10px] ${passed ? 'text-green-400' : 'text-red-400'}`}>
                      {sub.status === 'Pass' ? '✓' : sub.status === 'Fail' ? '✗' : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            {exam.overall_percentage != null && (
              <div className="flex items-center justify-between bg-indigo-500/10 rounded px-2 py-1.5 text-[11px] border border-indigo-500/20">
                <span className="text-white font-semibold">Overall</span>
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">{exam.total_obtained}/{exam.total_max}</span>
                  <span className="text-indigo-300 font-bold">{exam.overall_percentage}%</span>
                  <span className="bg-indigo-500/30 px-1.5 py-0.5 rounded text-[10px] text-indigo-200 font-bold">{exam.overall_grade}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  /** Staff profile adaptive card */
  const renderStaffCard = (data: any) => {
    if (!data || !data.name) return null;
    const fields = [
      { label: 'Employee ID', value: data.employee_id },
      { label: 'Department', value: data.department },
      { label: 'Designation', value: data.designation },
      { label: 'Gender', value: data.gender },
      { label: 'Date of Birth', value: data.date_of_birth },
      { label: 'Mobile', value: data.mobile },
      { label: 'Email', value: data.email },
      { label: 'Qualification', value: data.qualification },
      { label: 'Date of Joining', value: data.date_of_joining },
    ].filter(f => f.value && f.value !== 'None' && f.value !== 'N/A');

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 rounded-lg px-3 py-2">
          <FaChalkboardTeacher className="text-teal-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.name}</div>
            <div className="text-[10px] text-gray-400">{data.department} • {data.employee_id || 'No ID'}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {fields.map((f, i) => (
            <div key={i} className="text-[11px]">
              <span className="text-gray-500">{f.label}:</span>{' '}
              <span className="text-gray-200">{f.value}</span>
            </div>
          ))}
        </div>
        {/* Class-Sections */}
        {data.class_sections && data.class_sections.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1 px-1">📚 Classes & Sections</div>
            <div className="flex flex-wrap gap-1">
              {data.class_sections.map((cs: string, i: number) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/20">{cs}</span>
              ))}
            </div>
          </div>
        )}
        {/* Subjects */}
        {data.subjects && data.subjects.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1 px-1">📖 Subjects</div>
            <div className="flex flex-wrap gap-1">
              {data.subjects.map((subj: string, i: number) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{subj}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Staff list card (multiple matches) */
  const renderStaffListCard = (data: any[], content: string) => {
    if (!data || !Array.isArray(data)) return renderTextCard(content);
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-400">🔍 Found <strong className="text-white">{data.length}</strong> staff members:</div>
        <div className="space-y-1">
          {data.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 text-[11px] border border-white/5">
              <FaChalkboardTeacher className="text-teal-400 text-xs flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium">{s.name}</span>
                <span className="text-gray-500 ml-2">ID: {s.employee_id || 'N/A'}</span>
                {s.department && <span className="text-gray-500 ml-2">• {s.department}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 italic">💡 Specify the exact employee ID or full name for detailed info.</div>
      </div>
    );
  };

  /** Staff attendance adaptive card */
  const renderStaffAttendanceCard = (data: any, content: string) => {
    if (!data || !data.staff_name) return renderTextCard(content);
    const pctColor = data.percentage >= 75 ? 'text-green-400' : data.percentage >= 50 ? 'text-yellow-400' : 'text-red-400';
    const pctBg = data.percentage >= 75 ? 'bg-green-500' : data.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-lg px-3 py-2">
          <FaChalkboardTeacher className="text-teal-400 text-base" />
          <div>
            <div className="font-bold text-white text-sm">{data.staff_name}</div>
            <div className="text-[10px] text-gray-400">{data.department} • Last {data.period_days} days</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="px-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400">Attendance</span>
            <span className={`font-bold ${pctColor}`}>{data.percentage}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div className={`${pctBg} h-2 rounded-full transition-all`} style={{ width: `${Math.min(data.percentage, 100)}%` }} />
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-5 gap-1">
          {[
            { label: 'Working', value: data.working_days, color: 'text-blue-400' },
            { label: 'Present', value: data.present, color: 'text-green-400' },
            { label: 'Absent', value: data.absent, color: 'text-red-400' },
            { label: 'Late', value: data.late, color: 'text-yellow-400' },
            { label: 'Leave', value: data.leave, color: 'text-cyan-400' },
          ].map((s, i) => (
            <div key={i} className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
              <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Help menu card — two prominent options */
  const renderHelpMenuCard = () => {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FiHelpCircle className="text-indigo-400 text-base" />
          <span className="font-bold text-white text-sm">How can I help you?</span>
        </div>
        <div className="text-[12px] text-gray-400">Choose an option below:</div>
        <button
          onClick={() => handleSend('Student Details Help')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-500/20 hover:border-indigo-500/40 rounded-xl px-4 py-3 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <FaUserGraduate className="text-indigo-400 text-sm" />
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">Student Details Help</div>
            <div className="text-[10px] text-gray-500">Search students, attendance, marks & fees</div>
          </div>
          <FiChevronDown className="text-gray-500 -rotate-90 text-xs" />
        </button>
        <button
          onClick={() => handleSend('Staff Details Help')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/20 hover:border-teal-500/40 rounded-xl px-4 py-3 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <FaChalkboardTeacher className="text-teal-400 text-sm" />
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors">Staff Details Help</div>
            <div className="text-[10px] text-gray-500">Search staff, subjects, classes & attendance</div>
          </div>
          <FiChevronDown className="text-gray-500 -rotate-90 text-xs" />
        </button>
        <button
          onClick={() => handleSend('Technical Help')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/20 hover:border-amber-500/40 rounded-xl px-4 py-3 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <span className="text-base">🛠️</span>
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">Technical Help</div>
            <div className="text-[10px] text-gray-500">Report a bug, request a feature, or raise a ticket</div>
          </div>
          <FiChevronDown className="text-gray-500 -rotate-90 text-xs" />
        </button>
        <button
          onClick={() => handleSend('Know Your App')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/20 hover:border-cyan-500/40 rounded-xl px-4 py-3 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <span className="text-base">📚</span>
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">Know Your App</div>
            <div className="text-[10px] text-gray-500">Step-by-step guide to every feature, with examples & FAQ</div>
          </div>
          <FiChevronDown className="text-gray-500 -rotate-90 text-xs" />
        </button>
      </div>
    );
  };

  /** Raise ticket card — prompt with button to open ticket form */
  const renderRaiseTicketCard = (content: string) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg px-3 py-2">
          <span className="text-base">🛠️</span>
          <div>
            <div className="font-bold text-white text-sm">Technical Support</div>
            <div className="text-[10px] text-gray-400">Raise a ticket to the dev team</div>
          </div>
        </div>
        {renderTextCard(content)}
        <button
          onClick={() => setShowTicketModal(true)}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold text-sm rounded-xl px-4 py-2.5 transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
        >
          <FiHelpCircle className="text-sm" />
          Raise a Ticket
        </button>
      </div>
    );
  };

  /** Know Your App — main category menu */
  const renderKnowYourAppCard = (data: any, content: string) => {
    const categories: any[] = data?.categories || [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-lg px-3 py-2">
          <span className="text-base">📚</span>
          <div>
            <div className="font-bold text-white text-sm">Know Your App</div>
            <div className="text-[10px] text-gray-400">Select a topic to learn step-by-step</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {categories.map((cat: any, i: number) => (
            <button
              key={i}
              onClick={() => handleSend(`${cat.icon} ${cat.title}`)}
              className="w-full flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 rounded-lg px-3 py-2 transition-all duration-200 group"
            >
              <span className="text-base flex-shrink-0">{cat.icon}</span>
              <div className="text-left flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white group-hover:text-cyan-300 transition-colors">{cat.title}</div>
                <div className="text-[10px] text-gray-500 truncate">{cat.summary}</div>
              </div>
              <FiChevronDown className="text-gray-600 -rotate-90 text-xs flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  /** Know Your App — detailed feature guide with FAQ */
  const renderKBDetailCard = (data: any, content: string) => {
    const faq: any[] = data?.faq || [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-lg px-3 py-2">
          <span className="text-base">{data?.icon || '📖'}</span>
          <div>
            <div className="font-bold text-white text-sm">{data?.title || 'Guide'}</div>
            <div className="text-[10px] text-gray-400">Step-by-step instructions</div>
          </div>
        </div>
        {renderTextCard(content)}
        {faq.length > 0 && (
          <div className="mt-2">
            <div className="text-[11px] font-semibold text-cyan-400 mb-1.5 px-1">❓ Frequently Asked Questions</div>
            <div className="space-y-1.5">
              {faq.map((item: any, i: number) => (
                <div key={i} className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                  <div className="text-[11px] font-medium text-white mb-0.5">Q: {item.q}</div>
                  <div className="text-[10px] text-gray-400">A: {item.a}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => handleSend('Know Your App')}
          className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-[11px] font-medium rounded-lg px-3 py-1.5 transition-all duration-200"
        >
          ← Back to All Topics
        </button>
      </div>
    );
  };

  /** Main adaptive card renderer — picks the right card based on data.card_type or tool_used */
  const renderAdaptiveCard = (msg: Message) => {
    const { data, content, tool_used } = msg;
    const cardType = data?.card_type;

    // Welcome card
    if (cardType === 'welcome') return renderWelcomeCard(content);

    // Help menu card
    if (cardType === 'help_menu') return renderHelpMenuCard();

    // Raise ticket card
    if (cardType === 'raise_ticket') return renderRaiseTicketCard(content);

    // Know Your App — category menu
    if (cardType === 'know_your_app') return renderKnowYourAppCard(data, content);

    // Know Your App — detail page
    if (cardType === 'kb_detail') return renderKBDetailCard(data, content);

    // Fee summary card
    if (cardType === 'fee_summary') return renderFeeCard(data, content);

    // Simple text card (greetings etc.)
    if (cardType === 'text') return renderTextCard(content);

    // Student details card (single)
    if (tool_used === 'student_details' && data && !Array.isArray(data) && data.name) {
      return renderStudentCard(data);
    }

    // Student list card (multiple)
    if (tool_used === 'student_details' && data && Array.isArray(data)) {
      return renderStudentListCard(data, content);
    }

    // Attendance card
    if (tool_used === 'attendance_history' && data && data.student_name) {
      return renderAttendanceCard(data, content);
    }

    // Marks card
    if (tool_used === 'marks_details' && data && data.exams) {
      return renderMarksCard(data, content);
    }

    // Staff details card (single)
    if (tool_used === 'staff_details' && data && !Array.isArray(data) && data.name) {
      return renderStaffCard(data);
    }

    // Staff list card (multiple)
    if (tool_used === 'staff_details' && data && Array.isArray(data)) {
      return renderStaffListCard(data, content);
    }

    // Staff attendance card
    if (tool_used === 'staff_attendance' && data && data.staff_name) {
      return renderStaffAttendanceCard(data, content);
    }

    // Default: text card
    return renderTextCard(content);
  };

  const chatWidgetSize = isMaximized
    ? 'fixed inset-4 z-50'
    : 'fixed bottom-20 right-5 w-[420px] h-[600px] z-50';

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] hover:scale-110 transition-all duration-300 flex items-center justify-center group"
        >
          <FaRobot className="text-xl group-hover:rotate-12 transition-transform drop-shadow-lg" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
              {unreadCount}
            </span>
          )}
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-20" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`${chatWidgetSize} flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <FaRobot className="text-white text-sm" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1a1a2e]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">School Assistant</h3>
                <p className="text-[10px] text-green-400">● Online — MCP Tools Active</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                title={isMaximized ? 'Minimize' : 'Maximize'}
              >
                {isMaximized ? <FiMinimize2 className="text-sm" /> : <FiMaximize2 className="text-sm" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Close"
              >
                <FiX className="text-sm" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#0f172a] to-[#1e293b] p-4 space-y-4 chat-messages-scroll">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                }`}>
                  {msg.role === 'user' ? <FiUser /> : <FiCpu />}
                </div>

                {/* Bubble */}
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                  <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-tr-sm'
                      : 'bg-white/5 border border-white/10 text-gray-300 rounded-tl-sm'
                  }`}>
                    {msg.loading ? (
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-gray-500">Querying tools...</span>
                      </div>
                    ) : msg.role === 'user' ? (
                      <span>{msg.content}</span>
                    ) : (
                      renderAdaptiveCard(msg)
                    )}
                  </div>

                  {/* Tool badge */}
                  {msg.tool_used && !msg.loading && (
                    <div className="flex items-center gap-1.5 mt-1 ml-1">
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                        🔧 {msg.tool_used}
                      </span>
                      <span className="text-[9px] text-gray-600">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {/* Suggestion chips */}
                  {msg.suggestions && msg.suggestions.length > 0 && !msg.loading && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                      {msg.suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(s)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/30 hover:text-indigo-200 transition-all duration-200 whitespace-nowrap"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="bg-[#1a1a2e] border-t border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about students, staff, attendance, marks, fees..."
                  disabled={isLoading}
                  className="w-full bg-white/5 text-sm text-white placeholder-gray-500 rounded-xl pl-4 pr-10 py-2.5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all disabled:opacity-50"
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-40 disabled:hover:shadow-none transition-all duration-200"
              >
                <FiSend className="text-sm" />
              </button>
            </div>
            <p className="text-[9px] text-gray-600 mt-1.5 text-center">
              School ERP Assistant • MCP Tool Protocol • Type "help" for commands
            </p>
          </div>
        </div>
      )}

      {/* Ticket Modal from Chat */}
      <TicketModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        onSuccess={() => {
          setShowTicketModal(false);
          const successMsg: Message = {
            id: Date.now(),
            role: 'assistant',
            content: '✅ Your ticket has been submitted successfully! The dev team will be notified via email.',
            timestamp: new Date(),
            data: { card_type: 'text' },
            suggestions: ['help'],
          };
          setMessages(prev => [...prev, successMsg]);
        }}
      />

      {/* Custom scrollbar for chat */}
      <style>{`
        .chat-messages-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .chat-messages-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-messages-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .chat-messages-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </>
  );
};

export default ChatWidget;
