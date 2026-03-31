import React, { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Toast as ToastType } from '../../store';

interface ToastProps {
  toast: ToastType;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <CheckCircle size={18} className="toast-icon-success" />;
      case 'warning': return <AlertTriangle size={18} className="toast-icon-warning" />;
      case 'error': return <AlertCircle size={18} className="toast-icon-error" />;
      default: return null;
    }
  };

  return (
    <div className={`toast-item toast-${toast.type} animate-slide-in`}>
      <div className="toast-content">
        {getIcon()}
        <span className="toast-message">{toast.message}</span>
      </div>
      <button className="toast-close-btn" onClick={() => onClose(toast.id)}>
        <X size={14} />
      </button>
    </div>
  );
};

export default Toast;
