const express = require('express');
const cors = require('cors');
const sendOTPHandler = require('./api/send-otp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Zomato OTP API is running' });
});

// Send OTP endpoint
app.post('/api/send-otp', async (req, res) => {
  try {
    await sendOTPHandler(req, res);
  } catch (error) {
    console.error('Unhandled error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/send-otp`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});

