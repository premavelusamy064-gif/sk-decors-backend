const express = require("express");
const db = require("./db");
const router = express.Router();

/* ===== LOGIN ===== */
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM admins WHERE (username=? OR email=?) AND password=?",
    [username, username, password],
    (err, result) => {
      if (result.length > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false });
      }
    }
  );
});

/* ===== FORGOT CHECK ===== */
router.post("/forgot-check", (req, res) => {
  const { value } = req.body;

  db.query(
    "SELECT * FROM admins WHERE username=? OR email=?",
    [value, value],
    (err, result) => {
      res.json({ success: result.length > 0 });
    }
  );
});

/* ===== RESET PASSWORD ===== */
router.post("/reset-password", (req, res) => {
  const { value, newPassword } = req.body;

  db.query(
    "UPDATE admins SET password=? WHERE username=? OR email=?",
    [newPassword, value, value],
    () => res.json({ success: true })
  );
});

module.exports = router;
