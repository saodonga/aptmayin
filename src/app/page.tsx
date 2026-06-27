'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { 
  Printer, 
  History, 
  BarChart3, 
  Settings, 
  LogOut, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus, 
  Shield, 
  UserPlus, 
  RefreshCw,
  FileText,
  Edit,
  Trash2,
  Search,
  Wifi,
  WifiOff,
  AlertCircle,
  Activity,
  ArrowRight,
  Usb,
  Zap,
  Globe,
  Network,
  Cable
} from 'lucide-react';

interface PrintJob {
  id: string;
  userId: string;
  printerId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  totalPages: number;
  paperSize: string;
  duplex: boolean;
  colorMode: string;
  status: string;
  errorLog?: string;
  createdAt: string;
  user?: {
    name: string;
    email: string;
  };
  printer: {
    displayName: string;
  };
}

interface PrinterConfig {
  id: string;
  name: string;
  displayName: string;
  connection: string;
  status: string;
  isColor: boolean;
  isDuplex: boolean;
  location?: string;
}

interface UserConfig {
  id: string;
  name: string;
  email: string;
  role: string;
  pageQuota: number;
  pagesPrinted: number;
  isProtected: boolean;
  createdAt: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Navigation state
  const [activeTab, setActiveTab] = useState<'print' | 'history' | 'analytics' | 'admin'>('print');

  // Application data states
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [history, setHistory] = useState<PrintJob[]>([]);
  const [users, setUsers] = useState<UserConfig[]>([]);
  const [userData, setUserData] = useState<{ pagesPrinted: number; pageQuota: number } | null>(null);

  // Print Form States
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [paperSize, setPaperSize] = useState<string>('A4');
  const [duplex, setDuplex] = useState<boolean>(true);
  const [colorMode, setColorMode] = useState<string>('GRAY');
  const [copies, setCopies] = useState<number>(1);

  // Admin Form States
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterDisplayName, setNewPrinterDisplayName] = useState('');
  const [newPrinterConnection, setNewPrinterConnection] = useState('');
  const [newPrinterLocation, setNewPrinterLocation] = useState('');
  const [newPrinterColor, setNewPrinterColor] = useState(false);
  const [newPrinterDuplex, setNewPrinterDuplex] = useState(true);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);

  // Printer Detection Wizard States
  const [detectIp, setDetectIp] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<{
    online: boolean;
    openPorts: number[];
    detectedProtocol?: string;
    recommendedConnection?: string;
    successfulIppPath?: string | null;
    message?: string;
    printerInfo?: {
      displayName: string;
      isColor: boolean;
      isDuplex: boolean;
    } | null;
  } | null>(null);
  const [detectStep, setDetectStep] = useState<string>('');

  // USB Printer Detection States
  const [detectingUsb, setDetectingUsb] = useState(false);
  const [usbPrinters, setUsbPrinters] = useState<{
    uri: string;
    displayName: string;
    isColor: boolean;
    isDuplex: boolean;
  }[] | null>(null);
  const [usbScanError, setUsbScanError] = useState<string | null>(null);

  // Smart Connection Type Selector
  type ConnProtocol = 'ipp' | 'socket' | 'lpd' | 'usb' | 'manual';
  const [connProtocol, setConnProtocol] = useState<ConnProtocol>('ipp');
  const [connIp, setConnIp] = useState('');
  const [connPort, setConnPort] = useState('');
  const [connPath, setConnPath] = useState('/ipp/print');

  // Printer connection test states – keyed by printerId
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, {
    ok: boolean;
    latencyMs: number;
    protocol: string;
    status?: string;
    model?: string;
    error?: string;
    mock?: boolean;
    testedAt: number;
  }>>({});

  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);



  // Fetch all initial data
  const fetchData = async () => {
    try {
      setRefreshing(true);
      // Fetch printers list
      const resPrinters = await fetch('/api/print');
      if (resPrinters.ok) {
        const data = await resPrinters.json();
        setPrinters(data);
        if (data.length > 0 && !selectedPrinter) {
          setSelectedPrinter(data[0].id);
        }
      }

      // Fetch history log
      const resHistory = await fetch('/api/history');
      if (resHistory.ok) {
        const data = await resHistory.json();
        setHistory(data);
      }

      // Fetch current user details (to refresh quota details)
      if (session?.user?.id) {
        const resUser = await fetch('/api/history'); // Use logs endpoint to get user info or custom endpoint
        // Let's deduce user quota from the history logs or from users list
      }
      
      setRefreshing(false);
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu:', error);
      setRefreshing(false);
    }
  };

  // Dedicated fetch user list for admin
  const fetchUsers = async () => {
    if (session?.user?.role !== 'ADMIN') return;
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        // Find current user data to sync quota bar
        const currentUser = data.find((u: any) => u.id === session.user.id);
        if (currentUser) {
          setUserData({
            pagesPrinted: currentUser.pagesPrinted,
            pageQuota: currentUser.pageQuota
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchData();
      if (session.user.role === 'ADMIN') {
        fetchUsers();
      }
    }
  }, [status, session, router]);

  // Handle auto fallback of user quota if users list isn't fetched yet
  useEffect(() => {
    if (users.length > 0 && session?.user?.id && !userData) {
      const currentUser = users.find(u => u.id === session.user.id);
      if (currentUser) {
        setUserData({
          pagesPrinted: currentUser.pagesPrinted,
          pageQuota: currentUser.pageQuota
        });
      }
    }
  }, [users, session, userData]);

  // (Sync Connection URI logic removed to prevent React Hook count mismatch across HMR reloads)

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // Action: File upload selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSubmitMessage(null);
    }
  };

  // Action: Print Submission
  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedPrinter) {
      setSubmitMessage({ type: 'error', text: 'Vui lòng chọn file và máy in!' });
      return;
    }

    setLoading(true);
    setSubmitMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('printerId', selectedPrinter);
    formData.append('paperSize', paperSize);
    formData.append('duplex', String(duplex));
    formData.append('colorMode', colorMode);
    formData.append('copies', String(copies));

    try {
      const res = await fetch('/api/print', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setSubmitMessage({
          type: 'success',
          text: `Gửi lệnh in thành công! ${data.mock ? '[Chế độ chạy thử]' : ''}`
        });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchData();
        if (session?.user?.role === 'ADMIN') {
          fetchUsers();
        }
      } else {
        setSubmitMessage({ type: 'error', text: data.error || 'Lỗi hệ thống khi gửi in!' });
      }
    } catch (err) {
      setSubmitMessage({ type: 'error', text: 'Không thể kết nối đến máy chủ!' });
    } finally {
      setLoading(false);
    }
  };

  // Action Admin: Create or Update printer
  const handlePrinterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalConnection = buildConnectionUri();
    if (!newPrinterName || !newPrinterDisplayName || !finalConnection) {
      alert('Vui lòng điền đủ thông tin bắt buộc (Đặc biệt là địa chỉ kết nối)!');
      return;
    }

    const isEdit = !!editingPrinterId;
    const url = isEdit ? `/api/admin/printers/${editingPrinterId}` : '/api/admin/printers';
    const method = isEdit ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPrinterName,
          displayName: newPrinterDisplayName,
          connection: finalConnection,
          isColor: newPrinterColor,
          isDuplex: newPrinterDuplex,
          location: newPrinterLocation,
        }),
      });

      if (res.ok) {
        alert(isEdit ? 'Cập nhật thông tin máy in thành công!' : 'Thêm máy in thành công!');
        setNewPrinterName('');
        setNewPrinterDisplayName('');
        setNewPrinterConnection('');
        setNewPrinterLocation('');
        setNewPrinterColor(false);
        setNewPrinterDuplex(true);
        setEditingPrinterId(null);
        fetchData();
      } else {
        const d = await res.json();
        alert(`Lỗi: ${d.error}`);
      }
    } catch (e) {
      alert('Không thể kết nối đến máy chủ!');
    }
  };

  const startEditPrinter = (printer: PrinterConfig) => {
    setEditingPrinterId(printer.id);
    setNewPrinterName(printer.name);
    setNewPrinterDisplayName(printer.displayName);
    setNewPrinterConnection(printer.connection);
    setNewPrinterLocation(printer.location || '');
    setNewPrinterColor(printer.isColor);
    setNewPrinterDuplex(printer.isDuplex);
    // When editing, switch to manual mode so the existing URI is preserved as-is
    setConnProtocol('manual');
  };

  const cancelEditPrinter = () => {
    setEditingPrinterId(null);
    setNewPrinterName('');
    setNewPrinterDisplayName('');
    setNewPrinterConnection('');
    setNewPrinterLocation('');
    setNewPrinterColor(false);
    setNewPrinterDuplex(true);
    setConnProtocol('ipp');
    setConnIp('');
    setConnPort('');
    setConnPath('/ipp/print');
  };

  const handleDeletePrinter = async (printerId: string, displayName: string) => {
    const confirmDelete = confirm(`Bạn có thực sự muốn xóa máy in "${displayName}" khỏi hệ thống? Các lịch sử in liên quan cũng sẽ bị xóa.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/admin/printers/${printerId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('Xóa máy in thành công!');
        if (editingPrinterId === printerId) {
          cancelEditPrinter();
        }
        fetchData();
      } else {
        const d = await res.json();
        alert(`Lỗi: ${d.error}`);
      }
    } catch (e) {
      alert('Không thể kết nối đến máy chủ!');
    }
  };

  const handleDetectPrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectIp.trim()) return;

    setDetecting(true);
    setDetectResult(null);
    setDetectStep('Đang khởi tạo kết nối mạng...');

    try {
      setTimeout(() => setDetectStep('Đang quét cổng mạng song song (9100, 631, 515, 80, 443)...'), 400);
      
      const res = await fetch('/api/admin/printers/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: detectIp }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDetectResult({ online: false, openPorts: [], message: data.error || 'Lỗi kết nối từ server.' });
        setDetectStep('Quét lỗi: Không kết nối được.');
        return;
      }

      if (data.online) {
        if (data.openPorts.includes(631) || data.openPorts.includes(443)) {
          setDetectStep(`Phát hiện IPP${data.successfulIppPath ? ` tại ${data.successfulIppPath}` : ''}. Đang phân tích cấu hình máy in...`);
          await new Promise(r => setTimeout(r, 600));
        }
        setDetectResult(data);
        setDetectStep(`Quét thành công! Giao thức: ${data.detectedProtocol}`);
      } else {
        setDetectResult(data);
        setDetectStep('Quét hoàn tất: Thiết bị ngoại tuyến hoặc không phản hồi.');
      }
    } catch (e) {
      setDetectResult({ online: false, openPorts: [], message: 'Không thể kết nối tới server Next.js.' });
      setDetectStep('Quét lỗi: Lỗi kết nối.');
    } finally {
      setDetecting(false);
    }
  };

  // buildConnectionUri is now inlined in the useEffect above (before early return).
  // Keeping this helper for applyDetectConfig / URI parsing only.
  const buildConnectionUri = (): string => {
    if (connProtocol === 'manual' || connProtocol === 'usb') return newPrinterConnection;
    const ip = connIp.trim();
    if (!ip) return '';
    if (connProtocol === 'socket') return `socket://${ip}:${connPort || '9100'}`;
    if (connProtocol === 'lpd') return `lpd://${ip}/${(connPath || 'queue').replace(/^\//, '')}`;
    const port = connPort || '631';
    const path = connPath || '/ipp/print';
    return `ipp://${ip}:${port}${path.startsWith('/') ? path : '/' + path}`;
  };

  // Test a printer's connection from Admin panel
  const handleTestPrinterConnection = async (printerId: string) => {
    setTestingPrinter(printerId);
    try {
      const res = await fetch('/api/admin/printers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId }),
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [printerId]: { ...data, testedAt: Date.now() },
      }));
    } catch (e) {
      setTestResults(prev => ({
        ...prev,
        [printerId]: { ok: false, latencyMs: 0, protocol: 'Error', error: 'Lỗi kết nối server', testedAt: Date.now() },
      }));
    } finally {
      setTestingPrinter(null);
    }
  };

  const applyDetectConfig = () => {
    if (!detectResult || !detectResult.online) return;
    
    // Auto fill fields
    if (detectResult.printerInfo) {
      setNewPrinterDisplayName(detectResult.printerInfo.displayName);
      setNewPrinterColor(detectResult.printerInfo.isColor);
      setNewPrinterDuplex(detectResult.printerInfo.isDuplex);
      
      // Auto generate name based on model name
      const cleanName = detectResult.printerInfo.displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/(^_|_$)/g, '');
      setNewPrinterName(cleanName);
    } else {
      // Fallback auto fill
      setNewPrinterDisplayName(`Máy in mạng ${detectIp}`);
      setNewPrinterName(`printer_${detectIp.replace(/\./g, '_')}`);
    }
    
    if (detectResult.recommendedConnection) {
      // Sync smart selector fields from recommended connection
      const uri = detectResult.recommendedConnection;
      if (uri.startsWith('socket://')) {
        setConnProtocol('socket');
        const m = uri.match(/^socket:\/\/([^/:]+):?(\d+)?/);
        if (m) { setConnIp(m[1]); setConnPort(m[2] || '9100'); }
      } else if (uri.startsWith('lpd://')) {
        setConnProtocol('lpd');
        const m = uri.match(/^lpd:\/\/([^/]+)\/(.*)/);
        if (m) { setConnIp(m[1]); setConnPath(m[2]); }
      } else if (/^(ipp|ipps):\/\//.test(uri)) {
        setConnProtocol('ipp');
        const m = uri.match(/^ipp[s]?:\/\/([^/:]+):?(\d+)?(\/.*)?/);
        if (m) { setConnIp(m[1]); setConnPort(m[2] || '631'); setConnPath(m[3] || '/ipp/print'); }
      } else {
        setConnProtocol('manual');
        setNewPrinterConnection(uri);
      }
    }
    
    alert('Đã áp dụng cấu hình tự động! Hãy đặt vị trí và kiểm tra lại trước khi đăng ký.');
  };

  const handleScanUsbPrinters = async () => {
    setDetectingUsb(true);
    setUsbPrinters(null);
    setUsbScanError(null);

    try {
      const res = await fetch('/api/admin/printers/usb');
      const data = await res.json();
      if (!res.ok) {
        setUsbScanError(data.error || 'Lỗi không xác định khi quét cổng USB.');
        return;
      }
      setUsbPrinters(data.printers || []);
    } catch (e) {
      setUsbScanError('Không thể kết nối đến máy chủ Next.js.');
    } finally {
      setDetectingUsb(false);
    }
  };

  const applyUsbConfig = (printer: { uri: string; displayName: string; isColor: boolean; isDuplex: boolean }) => {
    setNewPrinterDisplayName(printer.displayName);
    setNewPrinterConnection(printer.uri);
    setConnProtocol('usb');
    setNewPrinterColor(printer.isColor);
    setNewPrinterDuplex(printer.isDuplex);

    // Auto generate name based on model name
    const cleanName = printer.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/(^_|_$)/g, '');
    setNewPrinterName(cleanName);

    alert('Đã áp dụng cấu hình máy in USB vào Form! Hãy đặt vị trí và kiểm tra trước khi đăng ký.');
  };

  // Action Admin: Update User Quota
  const handleUpdateQuota = async (userId: string, currentQuota: number) => {
    const newQuotaStr = prompt('Nhập hạn mức in ấn mới (số trang/tháng):', String(currentQuota));
    if (newQuotaStr === null) return;
    const newQuota = parseInt(newQuotaStr, 10);
    if (isNaN(newQuota) || newQuota < 0) {
      alert('Hạn mức không hợp lệ!');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageQuota: newQuota }),
      });

      if (res.ok) {
        alert('Cập nhật hạn mức thành công!');
        fetchUsers();
      } else {
        const d = await res.json();
        alert(`Lỗi: ${d.error}`);
      }
    } catch (e) {
      alert('Lỗi kết nối!');
    }
  };

  // Action Admin: Update User Role
  const handleUpdateRole = async (userId: string, email: string, currentRole: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.isProtected) {
      alert('Không thể thay đổi quyền của tài khoản admin hệ thống mặc định!');
      return;
    }

    const nextRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    const confirmChange = confirm(`Bạn có chắc muốn đổi quyền của ${email} sang ${nextRole}?`);
    if (!confirmChange) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });

      if (res.ok) {
        alert('Cập nhật quyền thành công!');
        fetchUsers();
      } else {
        const d = await res.json();
        alert(`Lỗi: ${d.error}`);
      }
    } catch (e) {
      alert('Lỗi kết nối!');
    }
  };

  // Action Admin: Delete User
  const handleDeleteUser = async (userId: string, email: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.isProtected) {
      alert('Không thể xóa tài khoản admin hệ thống mặc định!');
      return;
    }

    const confirmDelete = confirm(`Bạn có thực sự muốn xóa tài khoản ${email} khỏi hệ thống?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('Đã xóa người dùng thành công!');
        fetchUsers();
      } else {
        const d = await res.json();
        alert(`Lỗi: ${d.error}`);
      }
    } catch (e) {
      alert('Lỗi kết nối!');
    }
  };

  // Quota bar variables
  const quotaUsed = userData?.pagesPrinted ?? 0;
  const quotaLimit = userData?.pageQuota ?? 100;
  const quotaPercent = Math.min(Math.round((quotaUsed / quotaLimit) * 100), 100);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Sidebar Header */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
              <Printer className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white uppercase">PrintServer</h1>
              <span className="text-xs text-slate-400">Điều khiển từ xa</span>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('print')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'print'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Printer className="h-4 w-4" />
              In tài liệu
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <History className="h-4 w-4" />
              Lịch sử in
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Báo cáo & Thống kê
            </button>
            {session?.user?.role === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'admin'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-4 w-4" />
                  Quản lý hệ thống
                </span>
                <span className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Admin
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Sidebar Footer (User Info & Quota Info) */}
        <div className="p-4 border-t border-slate-800 space-y-4">
          {/* Quota Progress widget */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Hạn mức tháng</span>
              <span className="text-xs font-semibold text-indigo-400">{quotaUsed}/{quotaLimit} trang</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${quotaPercent}%` }}
              ></div>
            </div>
          </div>

          {/* User profile details */}
          <div className="flex items-center justify-between p-1 bg-slate-950/40 rounded-xl border border-slate-800/40">
            <div className="flex items-center gap-3 overflow-hidden p-1">
              {session?.user?.image ? (
                <img 
                  src={session.user.image} 
                  alt="avatar" 
                  className="h-8 w-8 rounded-lg shrink-0 border border-slate-700 shadow-inner" 
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase shadow-inner">
                  {session?.user?.name?.substring(0, 2) || 'US'}
                </div>
              )}
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate leading-tight">{session?.user?.name}</div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{session?.user?.email}</div>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Window */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/40 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-white capitalize tracking-wide">
              {activeTab === 'print' && 'Gửi Yêu Cầu In Ấn'}
              {activeTab === 'history' && 'Nhật Ký File Đã In'}
              {activeTab === 'analytics' && 'Báo Cáo Hoạt Động'}
              {activeTab === 'admin' && 'Bảng Điều Khiển Hệ Thống'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </header>

        {/* Dynamic Inner Tab View */}
        <div className="flex-1 p-8 overflow-y-auto">
          {/* TAB 1: PRINT */}
          {activeTab === 'print' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {submitMessage && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-md ${
                  submitMessage.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {submitMessage.type === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="text-sm font-medium">{submitMessage.text}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                {/* Form column (Left 3 cols) */}
                <form onSubmit={handlePrintSubmit} className="md:col-span-3 bg-slate-900 p-8 rounded-2xl border border-slate-800 space-y-6 shadow-xl">
                  {/* File Upload selection wrapper */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tài liệu cần in</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/20 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        className="hidden" 
                        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" 
                      />
                      <div className="p-3 bg-slate-800 rounded-xl text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/5 border border-slate-800/80 transition-colors mb-3">
                        <Upload className="h-6 w-6" />
                      </div>
                      {file ? (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-white truncate max-w-xs">{file.name}</p>
                          <p className="text-xs text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm font-medium text-slate-300">Click để tải file lên</p>
                          <p className="text-xs text-slate-500 mt-1">Hỗ trợ PDF, Word, Excel, Hình ảnh (Tối đa 50MB)</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Printer Select */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chọn máy in</label>
                    <select
                      value={selectedPrinter}
                      onChange={(e) => setSelectedPrinter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors"
                    >
                      {printers.length === 0 ? (
                        <option value="">Chưa có máy in nào cấu hình trên hệ thống...</option>
                      ) : (
                        printers.map((p) => {
                          const testR = testResults[p.id];
                          const statusMark = testR
                            ? (testR.ok ? '🟢' : '🔴')
                            : '⚪';
                          return (
                            <option key={p.id} value={p.id}>
                              {statusMark} {p.displayName} — {p.location || 'N/A'}
                            </option>
                          );
                        })
                      )}
                    </select>
                    {/* Live status line for selected printer */}
                    {selectedPrinter && testResults[selectedPrinter] && (
                      <div className={`flex items-center gap-2 mt-1.5 text-[11px] px-1 ${
                        testResults[selectedPrinter].ok ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {testResults[selectedPrinter].ok ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 shrink-0" />
                        )}
                        <span>
                          {testResults[selectedPrinter].ok
                            ? `Online · ${testResults[selectedPrinter].status} · ${testResults[selectedPrinter].latencyMs}ms`
                            : `Offline · ${testResults[selectedPrinter].error}`
                          }
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Print Configuration grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Khổ giấy</label>
                      <select
                        value={paperSize}
                        onChange={(e) => setPaperSize(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors"
                      >
                        <option value="A4">A4 (Tiêu chuẩn)</option>
                        <option value="A3">A3 (Khổ lớn)</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Số bản in (copies)</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Radios for Color & Duplex */}
                  <div className="grid grid-cols-2 gap-6 py-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chế độ in mặt</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300">
                          <input
                            type="radio"
                            checked={duplex}
                            onChange={() => setDuplex(true)}
                            className="text-indigo-600 border-slate-800 bg-slate-950 focus:ring-0"
                          />
                          In 2 mặt
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300">
                          <input
                            type="radio"
                            checked={!duplex}
                            onChange={() => setDuplex(false)}
                            className="text-indigo-600 border-slate-800 bg-slate-950 focus:ring-0"
                          />
                          In 1 mặt
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chế độ màu</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300">
                          <input
                            type="radio"
                            checked={colorMode === 'GRAY'}
                            onChange={() => setColorMode('GRAY')}
                            className="text-indigo-600 border-slate-800 bg-slate-950 focus:ring-0"
                          />
                          Đen trắng
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300">
                          <input
                            type="radio"
                            checked={colorMode === 'COLOR'}
                            onChange={() => setColorMode('COLOR')}
                            className="text-indigo-600 border-slate-800 bg-slate-950 focus:ring-0"
                          />
                          Màu sắc
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || printers.length === 0}
                    className="w-full bg-indigo-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-600/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang truyền dữ liệu in...
                      </>
                    ) : (
                      <>
                        <Printer className="h-4 w-4" />
                        Bắt đầu in tài liệu
                      </>
                    )}
                  </button>
                </form>

                {/* Instructions column (Right 2 cols) */}
                <div className="md:col-span-2 bg-slate-900/40 p-8 rounded-2xl border border-slate-800/80 space-y-6">
                  <h3 className="font-bold text-white text-md">Lưu ý trước khi in</h3>
                  <ul className="space-y-4 text-sm text-slate-300">
                    <li className="flex gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-2"></div>
                      <span>Hệ thống sẽ tự động quét số trang đối với file `.pdf`. Đối với file khác, mặc định tính là 1 trang để duyệt quota.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-2"></div>
                      <span>Một trang in 2 mặt (`duplex`) vẫn được ghi nhận là 2 trang in trừ vào hạn mức Quota của bạn.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-2"></div>
                      <span>Tài khoản của bạn sẽ tự động reset hạn mức về mặc định vào ngày đầu tiên của mỗi tháng.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-2"></div>
                      <span>Vui lòng liên hệ với Quản trị viên hệ thống để yêu cầu cấp thêm hạn mức khi cần thiết.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORY */}
          {activeTab === 'history' && (
            <div className="max-w-6xl mx-auto bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              {history.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center">
                  <div className="p-4 rounded-full bg-slate-800 text-slate-500 mb-4">
                    <History className="h-8 w-8" />
                  </div>
                  <h3 className="font-bold text-white text-md">Chưa có bản ghi in ấn nào</h3>
                  <p className="text-slate-400 text-sm mt-1">Lịch sử in tài liệu của bạn sẽ xuất hiện tại đây.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/50">
                        {session?.user?.role === 'ADMIN' && <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Người in</th>}
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tên file</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Máy in</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Khổ giấy</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">In 2 mặt</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Màu</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Số trang</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Trạng thái</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {history.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-850/40 transition-colors">
                          {session?.user?.role === 'ADMIN' && (
                            <td className="p-4">
                              <div className="text-xs font-semibold text-white">{job.user?.name || 'Vô danh'}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{job.user?.email}</div>
                            </td>
                          )}
                          <td className="p-4 font-medium text-xs max-w-xs truncate text-indigo-200" title={job.fileName}>
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{job.fileName}</span>
                            </div>
                          </td>
                          <td className="p-4 text-xs text-slate-300">{job.printer?.displayName}</td>
                          <td className="p-4 text-xs text-center text-slate-300">{job.paperSize}</td>
                          <td className="p-4 text-xs text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.duplex ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {job.duplex ? '2 mặt' : '1 mặt'}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.colorMode === 'COLOR' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {job.colorMode === 'COLOR' ? 'Màu' : 'Đen trắng'}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-center text-white font-semibold">{job.totalPages}</td>
                          <td className="p-4 text-xs text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              job.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              job.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                            }`}>
                              {job.status === 'SUCCESS' && 'Thành công'}
                              {job.status === 'FAILED' && 'Thất bại'}
                              {job.status === 'PROCESSING' && 'Đang xử lý'}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-right text-slate-400">
                            {new Date(job.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Analytics metrics summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-md">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng số Job in</span>
                  <div className="text-3xl font-extrabold text-white mt-2">{history.length}</div>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-md">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng số trang đã in</span>
                  <div className="text-3xl font-extrabold text-indigo-400 mt-2">
                    {history.filter(h => h.status === 'SUCCESS').reduce((acc, curr) => acc + curr.totalPages, 0)}
                  </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-md">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tỷ lệ in 2 mặt (Eco)</span>
                  <div className="text-3xl font-extrabold text-emerald-400 mt-2">
                    {(() => {
                      const successJobs = history.filter(h => h.status === 'SUCCESS');
                      if (successJobs.length === 0) return '0%';
                      const duplexCount = successJobs.filter(h => h.duplex).length;
                      return `${Math.round((duplexCount / successJobs.length) * 100)}%`;
                    })()}
                  </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-md">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Job thất bại (Fail)</span>
                  <div className="text-3xl font-extrabold text-rose-500 mt-2">
                    {history.filter(h => h.status === 'FAILED').length}
                  </div>
                </div>
              </div>

              {/* Custom SVG Charts panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* SVG Chart 1: Daily load (last 5 prints) */}
                <div className="md:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Tải lượng in ấn 7 lượt in gần đây</h3>
                  <div className="relative h-64 flex items-end justify-between px-6 pt-10 border-b border-l border-slate-850">
                    {/* SVG grid lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-1 mt-10">
                      <div className="border-t border-slate-800/40 w-full"></div>
                      <div className="border-t border-slate-800/40 w-full"></div>
                      <div className="border-t border-slate-800/40 w-full"></div>
                    </div>

                    {history.slice(0, 7).reverse().map((job, idx) => {
                      const maxVal = Math.max(...history.slice(0, 7).map(j => j.totalPages), 10);
                      const heightPercent = Math.round((job.totalPages / maxVal) * 80) + 10;
                      return (
                        <div key={job.id} className="relative group flex flex-col items-center flex-1 mx-2 h-full justify-end">
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {job.totalPages} trang
                          </div>
                          {/* SVG Bar */}
                          <div 
                            className="w-8 bg-indigo-500/80 hover:bg-indigo-400 rounded-t-lg transition-all duration-500 flex items-center justify-center font-bold text-[10px] text-white/80"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {job.totalPages}
                          </div>
                          {/* Label */}
                          <span className="text-[10px] text-slate-400 truncate max-w-[60px] mt-2 select-none" title={job.fileName}>
                            {job.fileName.substring(0, 8)}..
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SVG Chart 2: Printer Usage Distribution */}
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Phân bổ in ấn theo máy</h3>
                  <div className="space-y-4">
                    {printers.map((p) => {
                      const count = history.filter(h => h.printerId === p.id && h.status === 'SUCCESS').reduce((acc, curr) => acc + curr.totalPages, 0);
                      const totalAll = history.filter(h => h.status === 'SUCCESS').reduce((acc, curr) => acc + curr.totalPages, 0) || 1;
                      const percent = Math.round((count / totalAll) * 100);

                      return (
                        <div key={p.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-300">{p.displayName}</span>
                            <span className="text-slate-400 font-semibold">{count} trang ({percent}%)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800/40">
                            <div 
                              className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ADMIN PANEL */}
          {activeTab === 'admin' && session?.user?.role === 'ADMIN' && (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Panel Top row: Add printer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Form Add Printer */}
                <form onSubmit={handlePrinterSubmit} className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    {editingPrinterId ? (
                      <Edit className="h-5 w-5 text-indigo-400" />
                    ) : (
                      <Plus className="h-5 w-5 text-indigo-400" />
                    )}
                    <h3 className="font-bold text-white text-md">
                      {editingPrinterId ? 'Sửa thông tin máy in' : 'Thêm máy in mới'}
                    </h3>
                  </div>

                  {/* USB Scanning Feature */}
                  {!editingPrinterId && (
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Usb className="h-3.5 w-3.5 text-indigo-400" />
                          Kết nối USB trực tiếp
                        </span>
                        <button
                          type="button"
                          onClick={handleScanUsbPrinters}
                          disabled={detectingUsb}
                          className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                        >
                          {detectingUsb ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Đang quét...
                            </>
                          ) : (
                            'Quét cổng USB'
                          )}
                        </button>
                      </div>

                      {/* USB Scan Results */}
                      {usbPrinters !== null && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-800">
                          {usbPrinters.length === 0 ? (
                            <div className="text-[10px] text-amber-400/90 italic flex items-center gap-1">
                              <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
                              Không phát hiện máy in USB nào. Hãy cắm cáp USB và kiểm tra nguồn máy in.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-0.5">
                              <div className="text-[9px] text-slate-400 font-medium">Tìm thấy {usbPrinters.length} thiết bị (Click để điền nhanh):</div>
                              {usbPrinters.map((up, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => applyUsbConfig(up)}
                                  className="w-full text-left bg-slate-900 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/30 p-2 rounded-lg text-[10px] transition-all flex justify-between items-center gap-2 cursor-pointer group"
                                >
                                  <div className="truncate flex-1">
                                    <span className="font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">{up.displayName}</span>
                                    <div className="font-mono text-[8px] text-slate-500 truncate mt-0.5">{up.uri}</div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {up.isDuplex && <span className="bg-emerald-500/10 text-emerald-400 text-[8px] px-1 py-0.2 rounded font-bold shrink-0">2M</span>}
                                    {up.isColor && <span className="bg-indigo-500/10 text-indigo-400 text-[8px] px-1 py-0.2 rounded font-bold shrink-0">Màu</span>}
                                    <ArrowRight className="h-3 w-3 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {usbScanError && (
                        <div className="text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg mt-1">
                          Lỗi quét: {usbScanError}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên CUPS (Không dấu/Khoảng trắng)</label>
                    <input
                      type="text"
                      required
                      placeholder="vd: hp_laserjet_404"
                      value={newPrinterName}
                      onChange={(e) => setNewPrinterName(e.target.value.replace(/\s+/g, '_').toLowerCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên hiển thị (DisplayName)</label>
                    <input
                      type="text"
                      required
                      placeholder="vd: Máy in HP 404 Kế Toán"
                      value={newPrinterDisplayName}
                      onChange={(e) => setNewPrinterDisplayName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Địa chỉ kết nối (Connection URI)</label>

                    {/* Smart Connection Type Selector */}
                    {!editingPrinterId && (
                      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 mb-2">
                        {([
                          { key: 'ipp',    label: 'IPP',      Icon: Globe },
                          { key: 'socket', label: 'JetDirect', Icon: Zap },
                          { key: 'lpd',    label: 'LPD',      Icon: Network },
                          { key: 'manual', label: 'Thủ công', Icon: Cable },
                        ] as { key: ConnProtocol; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setConnProtocol(key)}
                            className={`flex flex-col items-center gap-0.5 py-1.5 rounded text-[9px] font-bold transition-all ${
                              connProtocol === key
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* IPP fields */}
                    {!editingPrinterId && connProtocol === 'ipp' && (
                      <div className="grid grid-cols-5 gap-1.5">
                        <div className="col-span-2">
                          <input
                            type="text"
                            placeholder="IP (vd: 10.0.0.1)"
                            value={connIp}
                            onChange={e => setConnIp(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            type="text"
                            placeholder="Port"
                            value={connPort}
                            onChange={e => setConnPort(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200"
                          />
                        </div>
                        <div className="col-span-2">
                          <select
                            value={connPath}
                            onChange={e => setConnPath(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200"
                          >
                            <option value="/ipp/print">/ipp/print</option>
                            <option value="/ipp/printer">/ipp/printer</option>
                            <option value="/ipp/">/ipp/</option>
                            <option value="/printers/">/printers/</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* AppSocket fields */}
                    {!editingPrinterId && connProtocol === 'socket' && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="col-span-2">
                          <input type="text" placeholder="IP (vd: 10.0.0.1)" value={connIp} onChange={e => setConnIp(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200" />
                        </div>
                        <div>
                          <input type="text" placeholder="9100" value={connPort} onChange={e => setConnPort(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200" />
                        </div>
                      </div>
                    )}

                    {/* LPD fields */}
                    {!editingPrinterId && connProtocol === 'lpd' && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="col-span-2">
                          <input type="text" placeholder="IP" value={connIp} onChange={e => setConnIp(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200" />
                        </div>
                        <div>
                          <input type="text" placeholder="queue" value={connPath} onChange={e => setConnPath(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200" />
                        </div>
                      </div>
                    )}

                    {/* URI preview / manual field */}
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="vd: ipp://10.100.0.200:631/ipp/print"
                        value={newPrinterConnection}
                        onChange={(e) => {
                          setNewPrinterConnection(e.target.value);
                          if (!editingPrinterId) setConnProtocol('manual');
                        }}
                        className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-indigo-300 font-mono"
                      />
                      {newPrinterConnection && (
                        <div className="absolute right-2.5 top-2.5 text-[9px] text-indigo-500/60 font-bold uppercase">
                          URI
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vị trí (Location)</label>
                    <input
                      type="text"
                      placeholder="vd: Tầng 2 - Phòng Kế Toán"
                      value={newPrinterLocation}
                      onChange={(e) => setNewPrinterLocation(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>

                  <div className="flex gap-6 py-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={newPrinterColor}
                        onChange={(e) => setNewPrinterColor(e.target.checked)}
                        className="rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-0"
                      />
                      Hỗ trợ in màu
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={newPrinterDuplex}
                        onChange={(e) => setNewPrinterDuplex(e.target.checked)}
                        className="rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-0"
                      />
                      Hỗ trợ in 2 mặt
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-xs font-bold hover:bg-indigo-500 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {editingPrinterId ? 'Cập nhật máy in' : 'Đăng ký máy in'}
                    </button>
                    {editingPrinterId && (
                      <button
                        type="button"
                        onClick={cancelEditPrinter}
                        className="bg-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>

                {/* Right Column: Auto-Detect Wizard & List of configured printers */}
                <div className="md:col-span-2 space-y-6 flex flex-col h-full">
                  {/* Auto-Detect Wizard Card */}
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                      <Search className="h-5 w-5 text-indigo-400" />
                      <h3 className="font-bold text-white text-md">Dò tìm & Tự động cấu hình bằng IP</h3>
                    </div>

                    <form onSubmit={handleDetectPrinter} className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Nhập IP máy in (vd: 10.100.0.200)"
                          value={detectIp}
                          onChange={(e) => setDetectIp(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-10 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                        />
                        {detecting && (
                          <div className="absolute right-3 top-2.5">
                            <Loader2 className="animate-spin h-4 w-4 text-indigo-400" />
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={detecting || !detectIp.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-5 py-2.5 text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                      >
                        {detecting ? 'Đang dò tìm...' : 'Dò tìm máy in'}
                      </button>
                    </form>

                    {/* Step Log Output */}
                    {detectStep && (
                      <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-500/5 border border-indigo-500/10 px-3 py-2 rounded-lg font-mono">
                        <Activity className="h-3.5 w-3.5 animate-pulse shrink-0" />
                        <span>{detectStep}</span>
                      </div>
                    )}

                    {/* Result Output */}
                    {detectResult && (
                      <div className={`p-4 rounded-xl border space-y-3 ${
                        detectResult.online
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/5 border-rose-500/20 text-rose-300'
                      }`}>
                        <div className="flex items-start gap-3">
                          {detectResult.online ? (
                            <Wifi className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <WifiOff className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="text-xs font-bold uppercase tracking-wider">
                              Trạng thái thiết bị: {detectResult.online ? 'ONLINE (Đang hoạt động)' : 'OFFLINE (Ngoại tuyến)'}
                            </div>
                            {detectResult.online ? (
                              <>
                                <p className="text-xs text-slate-300">
                                  Phát hiện các cổng mở: <span className="font-mono text-white font-bold">{detectResult.openPorts.join(', ')}</span> ({detectResult.detectedProtocol}).
                                </p>
                                {detectResult.printerInfo ? (
                                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1 mt-2">
                                    <div><strong>Model máy:</strong> {detectResult.printerInfo.displayName}</div>
                                    <div><strong>In 2 mặt (Duplex):</strong> {detectResult.printerInfo.isDuplex ? 'Có hỗ trợ' : 'Không'}</div>
                                    <div><strong>In màu (Color):</strong> {detectResult.printerInfo.isColor ? 'Có hỗ trợ' : 'Không'}</div>
                                    <div className="break-all"><strong>URI Đề xuất:</strong> <code className="font-mono text-indigo-400">{detectResult.recommendedConnection}</code></div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-1">Giao thức IPP không phản hồi thông tin chi tiết. Đề xuất cấu hình thủ công cổng JetDirect (`9100`).</p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-rose-400 mt-1">{detectResult.message}</p>
                            )}
                          </div>
                        </div>

                        {/* Actions or Troubleshooting */}
                        {detectResult.online ? (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={applyDetectConfig}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/20"
                            >
                              Áp dụng cấu hình tự động
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 space-y-2 mt-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              Hướng dẫn sửa lỗi kết nối máy in
                            </div>
                            <ol className="list-decimal pl-4 text-[11px] text-slate-400 space-y-1.5">
                              <li>Kiểm tra xem máy in HP 404 đã được bật nguồn và cắm cáp mạng LAN chắc chắn chưa.</li>
                              <li>Mở cửa sổ dòng lệnh (Terminal) của server và gõ <code className="bg-slate-900 px-1 py-0.5 rounded text-white font-mono">ping {detectIp}</code> để kiểm tra độ thông suốt mạng.</li>
                              <li>Đảm bảo các tính năng **IPP (Cổng 631)** hoặc **Raw TCP/AppSocket (Cổng 9100)** đã được bật (`Enabled`) trong phần cài đặt mạng mạng LAN của máy in (thông qua trang web quản trị của máy in).</li>
                              <li>Nếu máy in và server nằm ở các dải IP khác nhau, hãy đảm bảo cổng switch hoặc tường lửa (firewall) cấu hình cho phép kết nối thông suốt.</li>
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* List of configuration printers */}
                  <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl flex flex-col flex-1 overflow-hidden max-h-[420px]">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                      <div className="flex items-center gap-2">
                        <Printer className="h-5 w-5 text-indigo-400" />
                        <h3 className="font-bold text-white text-md">Cấu hình máy in hệ thống</h3>
                      </div>
                      <span className="text-[10px] text-slate-500">{printers.length} máy in</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {printers.length === 0 ? (
                        <span className="text-slate-500 text-xs italic">Hệ thống chưa có máy in cấu hình...</span>
                      ) : (
                        printers.map((p) => {
                          const testR = testResults[p.id];
                          const isTesting = testingPrinter === p.id;
                          return (
                            <div key={p.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* Connection status dot */}
                                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                                      isTesting ? 'bg-amber-400 animate-pulse' :
                                      testR ? (testR.ok ? 'bg-emerald-400' : 'bg-rose-500') :
                                      'bg-slate-600'
                                    }`} title={testR ? (testR.ok ? `Online · ${testR.latencyMs}ms` : testR.error) : 'Chưa kiểm tra'} />
                                    <span className="font-bold text-xs text-white">{p.displayName}</span>
                                    <span className="bg-slate-800 text-[10px] text-slate-400 px-2 py-0.5 rounded uppercase font-semibold">
                                      {p.name}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1.5 font-mono truncate max-w-xs md:max-w-sm">{p.connection}</div>
                                  {p.location && <div className="text-[10px] text-slate-400 mt-1">📍 {p.location}</div>}
                                  {/* Test result info line */}
                                  {testR && (
                                    <div className={`text-[10px] mt-1.5 flex items-center gap-1.5 ${
                                      testR.ok ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                      {testR.ok ? (
                                        <><Zap className="h-2.5 w-2.5" />
                                        <span>{testR.status} · {testR.protocol} · {testR.latencyMs}ms{testR.model ? ` · ${testR.model}` : ''}{testR.mock ? ' · [Mock]' : ''}</span></>
                                      ) : (
                                        <><XCircle className="h-2.5 w-2.5" />
                                        <span>{testR.error}</span></>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Test Connection button */}
                                  <button
                                    onClick={() => handleTestPrinterConnection(p.id)}
                                    disabled={isTesting}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer disabled:opacity-50 flex items-center gap-1 bg-indigo-500/5 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/15 hover:border-indigo-500/40"
                                    title="Kiểm tra kết nối"
                                  >
                                    {isTesting ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Wifi className="h-3 w-3" />
                                    )}
                                    {isTesting ? 'Đang test...' : 'Test'}
                                  </button>
                                  <button
                                    onClick={() => startEditPrinter(p)}
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                      editingPrinterId === p.id 
                                        ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' 
                                        : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white'
                                    }`}
                                    title="Sửa máy in"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePrinter(p.id, p.displayName)}
                                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                                    title="Xóa máy in"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Users management table */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex items-center gap-2 bg-slate-950/20">
                  <Shield className="h-5 w-5 text-indigo-400" />
                  <h3 className="font-bold text-white text-md">Quản lý Thành viên & Phân quyền</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/40">
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Thành viên</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Vai trò (Role)</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Đã in (Tháng này)</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Hạn mức (Quota)</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Ngày tạo</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {users.map((user) => {
                        const isProtected = user.isProtected;
                        return (
                          <tr key={user.id} className="hover:bg-slate-850/30 transition-colors">
                            <td className="p-4 flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-xs uppercase flex items-center justify-center shrink-0">
                                {user.name?.substring(0, 2) || 'US'}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  {user.name || 'Người dùng mới'}
                                  {isProtected && <span title="Bảo vệ hệ thống"><Shield className="h-3 w-3 text-indigo-400" /></span>}
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5 block">{user.email}</span>
                              </div>
                            </td>
                            <td className="p-4 text-xs text-center">
                              <button
                                disabled={isProtected}
                                onClick={() => handleUpdateRole(user.id, user.email, user.role)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                  user.role === 'ADMIN' 
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20' 
                                    : 'bg-slate-800 text-slate-400 hover:bg-indigo-600/10 hover:text-indigo-400 hover:border-indigo-500/20 border border-transparent'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {user.role}
                              </button>
                            </td>
                            <td className="p-4 text-xs text-center font-bold text-slate-300">{user.pagesPrinted} trang</td>
                            <td className="p-4 text-xs text-center">
                              <span className="font-bold text-white">{user.pageQuota} trang</span>
                              <button
                                onClick={() => handleUpdateQuota(user.id, user.pageQuota)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold block mx-auto mt-0.5 underline transition-colors"
                              >
                                Chỉnh sửa
                              </button>
                            </td>
                            <td className="p-4 text-xs text-center text-slate-400">
                              {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="p-4 text-xs text-right">
                              <button
                                disabled={isProtected}
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Xóa tài khoản
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
