# Quick Start Guide

## 🚀 Run Locally (Easiest Way)

### Step 1: Navigate to the directory
```bash
cd standalone-api
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Start the server
```bash
npm start
```

You should see:
```
🚀 Server running on http://localhost:3000
📡 API endpoint: http://localhost:3000/api/send-otp
💚 Health check: http://localhost:3000/health
```

### Step 4: Test the API

**Using cURL:**
```bash
curl --location 'http://localhost:3000/api/send-otp' \
--header 'Content-Type: application/json' \
--data '{
    "identifier": "9014884219",
    "countryCode": "1",
    "type": "phone"
}'
```

**Using Postman/Thunder Client:**
- Method: `POST`
- URL: `http://localhost:3000/api/send-otp`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
    "identifier": "9014884219",
    "countryCode": "1",
    "type": "phone"
}
```

**Expected Response:**
```json
{
    "success": true,
    "message": "OTP sent successfully",
    "data": {
        "sessionId": "uuid-here"
    }
}
```

## 📝 Notes

- First run will download Chromium (~170MB) - this is normal!
- The server runs on port 3000 by default
- Change port by setting `PORT` environment variable: `PORT=8080 npm start`
- Make sure you have Node.js 18+ installed

## 🐛 Troubleshooting

**Port already in use?**
```bash
PORT=8080 npm start
```

**Chromium download fails?**
- Check your internet connection
- Try: `npm install puppeteer --force`

**Getting bot detection errors?**
- This is expected if Zomato blocks your IP
- Try using a VPN or proxy
- The stealth settings are already included

## 🌐 Deploy to Vercel/Netlify

See the main [README.md](./README.md) for deployment instructions.

