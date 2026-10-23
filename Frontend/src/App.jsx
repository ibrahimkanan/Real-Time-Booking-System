// frontend/src/App.jsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';
const EVENT_ID = 1;

// توليد معرف مستخدم فريد لكل تبويب متصفح لتجربة التزاحم بسهولة
const generateUserId = () => `user-${Math.floor(1000 + Math.random() * 9000)}`;

export default function App() {
  const [userId] = useState(generateUserId);
  const [seats, setSeats] = useState([]);
  const [myHeldSeat, setMyHeldSeat] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (text) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: Date.now() + Math.random(), text, time }, ...prev.slice(0, 19)]);
  };

  // 1. جلب المقاعد من السيرفر (أو إنشاء 30 مقعداً افتراضياً للعرض إذا لم يجهز مسار GET بعد)
  const fetchSeats = async () => {
    try {
      const res = await fetch(`${API_BASE}/seats/${EVENT_ID}`);
      if (!res.ok) throw new Error('Fallback to default grid');
      const data = await res.json();
      setSeats(data);
    } catch {
      const fallbackSeats = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        seat_number: `A${i + 1}`,
        status: 'available',
      }));
      setSeats(fallbackSeats);
    }
  };

  // 2. إعداد اتصال Socket.io والاستماع للتحديثات اللحظية
  useEffect(() => {
    fetchSeats();

    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('joinEvent', EVENT_ID);
      addLog(`Connected & joined room event:${EVENT_ID}`);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      addLog('Disconnected from real-time server');
    });

    socket.on('seatStatusUpdated', (payload) => {
      const { seatId, status } = payload;
      addLog(`⚡ Seat #${seatId} is now ${status.toUpperCase()}`);

      setSeats((prevSeats) =>
        prevSeats.map((seat) =>
          Number(seat.id) === Number(seatId) ? { ...seat, status } : seat
        )
      );

      // إذا انتهت مهلة المقعد أو تم حجزه، نحدّث حالة الاختيار الحالي
      setMyHeldSeat((current) => {
        if (current && Number(current.id) === Number(seatId) && status === 'available') {
          return null;
        }
        return current;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 3. تجميد المقعد عند الضغط عليه (Hold Seat)
  const handleSelectSeat = async (seat) => {
    if (seat.status !== 'available' || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`${API_BASE}/seats/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: EVENT_ID,
          seatId: seat.id,
          userId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || data.message || 'Seat is locked by another user!' });
        return;
      }

      setMyHeldSeat(seat);
      setFeedback({
        type: 'success',
        message: `Seat ${seat.seat_number || `#${seat.id}`} held for 5 minutes! Proceed to payment.`,
      });
    } catch (err) {
      console.log(err);
      setFeedback({ type: 'error', message: 'Network error while holding seat.' });
    } finally {
      setLoading(false);
    }
  };

  // 4. إتمام الدفع (يدعم وضع Mock ووضع Stripe Live تلقائياً)
  const handleCheckout = async () => {
    if (!myHeldSeat || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`${API_BASE}/payments/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: EVENT_ID,
          seatId: myHeldSeat.id,
          userId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Payment failed' });
        return;
      }

      // في حال كان النظام في وضع Stripe Live
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // في حال كان النظام في وضع Mock
      setFeedback({
        type: 'success',
        message: `🎉 Ticket Confirmed! Ref: ${data.bookingReference}`,
      });
      setMyHeldSeat(null);
    } catch (err) {
      console.log(err);
      setFeedback({ type: 'error', message: 'Failed to process checkout.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <h1>⚡ Real-Time Arena Booking</h1>
          <p>High-Concurrency Seat Reservation • Redis Locking • Socket.io</p>
        </div>

        <div className="status-bar">
          <div className="user-badge">Session: <strong>{userId}</strong></div>
          <div className={`socket-badge ${socketConnected ? 'online' : 'offline'}`}>
            <span className="dot" />
            {socketConnected ? 'Live Socket Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <div className="main-grid">
        {/* Left: Interactive Seat Map */}
        <section className="arena-card">
          <div className="stage-Wrapper">
            <div className="stage-arc" />
            <span className="stage-label">Main Concert Stage • Event #{EVENT_ID}</span>
          </div>

          <div className="seats-grid">
            {seats.map((seat) => {
              const isMine = myHeldSeat?.id === seat.id && seat.status === 'held';
              const seatClass = isMine ? 'my-hold' : seat.status;

              return (
                <button
                  key={seat.id}
                  className={`seat-btn ${seatClass}`}
                  onClick={() => handleSelectSeat(seat)}
                  disabled={seat.status !== 'available' || loading}
                  title={`Seat ${seat.seat_number || seat.id} (${seat.status})`}
                >
                  <span>{seat.seat_number || `#${seat.id}`}</span>
                </button>
              );
            })}
          </div>

          <div className="legend">
            <div className="legend-item">
              <span className="legend-box available" /> Available
            </div>
            <div className="legend-item">
              <span className="legend-box my-hold" /> Your Hold
            </div>
            <div className="legend-item">
              <span className="legend-box held" /> Held by Others
            </div>
            <div className="legend-item">
              <span className="legend-box booked" /> Booked
            </div>
          </div>
        </section>

        {/* Right: Checkout & Real-Time Event Stream */}
        <aside className="sidebar">
          <div className="panel">
            <h2>🎟️ Reservation Summary</h2>

            {myHeldSeat ? (
              <div className="checkout-box">
                <div className="seat-summary">
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Selected Seat</div>
                    <strong style={{ fontSize: '1.1rem' }}>
                      Seat {myHeldSeat.seat_number || `#${myHeldSeat.id}`}
                    </strong>
                  </div>
                  <div className="price-tag">$50.00</div>
                </div>

                <button
                  className="pay-btn"
                  onClick={handleCheckout}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Complete Payment ($50.00)'}
                </button>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Click on any <strong>Available</strong> blue seat on the map to lock it in Redis for 5 minutes.
              </p>
            )}

            {feedback && (
              <div className={`alert ${feedback.type}`} style={{ marginTop: '1rem' }}>
                {feedback.message}
              </div>
            )}
          </div>

          <div className="panel">
            <h2>📡 Real-Time Socket Stream</h2>
            {logs.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Waiting for live events...</p>
            ) : (
              <ul className="log-list">
                {logs.map((log) => (
                  <li key={log.id} className="log-item">
                    <span>{log.text}</span>
                    <span className="log-time">{log.time}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}