const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `item-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const validMime = allowedMimes.includes(file.mimetype);

    if (validExt && validMime) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP image formats are allowed (max 5 MB).'));
    }
  }
});

// Middleware wrapper to handle multer errors gracefully
function handleUpload(fieldName = 'image') {
  const uploadSingle = upload.single(fieldName);
  return (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image file size exceeds the 5 MB limit.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

module.exports = {
  handleUpload
};
