require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const app = express();
const multer = require("multer");
const fs = require("fs");
const nodemailer = require("nodemailer");

const PORT = 3000;
app.use(cors());
app.use(express.json());
// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads",
  express.static(path.join(__dirname, "../frontend/uploads"))
);
// DB connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "sk_decor",
  multipleStatements: true
});
db.connect(err => {
  if (err) {
    console.error("DB Error:", err);
    return;
  }
  console.log("MySQL Connected");
});
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
const uploadPath = path.join(__dirname, "../frontend/uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });
// Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});
/* ================= LOGIN ================= */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const sql =
    "SELECT * FROM admins WHERE username=? AND password=?";
  db.query(sql, [username, password], (err, result) => {
    if (err) return res.json({ success: false });
    if (result.length > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });
});
/* ================= FORGOT CHECK ================= */
app.post("/api/forgot-check", (req, res) => {
  const { value } = req.body;
  const sql =
    "SELECT * FROM admins WHERE email=? OR username=?";
  db.query(sql, [value, value], (err, result) => {
    if (result.length > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });
});
/* ================= RESET PASSWORD ================= */
app.post("/api/reset-password", (req, res) => {
  const { value, newPassword } = req.body;
  const sql =
    "UPDATE admins SET password=? WHERE email=? OR username=?";
  db.query(sql, [newPassword, value, value], () => {
    res.json({ success: true });
  });
});
/* ================= GALLERY APIs ================= */
// Get images (gallery OR slideshow using ?section=)
app.get("/api/gallery", (req, res) => {
  const section = req.query.section;

  let sql = "SELECT * FROM gallery";
  let params = [];

  if (section) {
    sql += " WHERE section=?";
    params.push(section);
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, result) => {
    if (err) return res.json([]);
    res.json(result);
  });
});
app.get("/api/gallery/homepage", (req, res) => {
  const sql = `
    SELECT * FROM gallery 
    WHERE section='homepage'
    ORDER BY created_at DESC
    LIMIT 8
  `;
  db.query(sql, (err, result) => {
    if (err) return res.json([]);
    res.json(result);
  });
});
app.get("/api/gallery/homepage/all", (req, res) => {
  db.query(
    "SELECT * FROM gallery WHERE section='homepage' ORDER BY id DESC",
    (err, result) => {
      if (err) return res.json([]);
      res.json(result);
    }
  );
});

// Get ONLY slideshow images
app.get("/api/gallery/slideshow", (req, res) => {
  db.query(
    "SELECT * FROM gallery WHERE section='slideshow' ORDER BY id DESC",
    (err, result) => {
      if (err) return res.json([]);
      res.json(result);
    }
  );
});
// Add image
app.post("/api/gallery", upload.single("image"), (req, res) => {
  if (!req.file) return res.json({ success: false, message: "No image selected" });

  const filePath = req.file.path;
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  const section = req.body.section || "gallery";
  const imageUrl = "/uploads/" + req.file.filename;

  const sql = `
    INSERT INTO gallery (image_url, image_hash, section)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [imageUrl, hash, section], (err) => {
    if (err) {
      // Delete the uploaded file to avoid clutter
      fs.unlinkSync(filePath);

      // If duplicate, send friendly message
      if (err.code === "ER_DUP_ENTRY") {
        return res.json({ success: false, message: "Image already exists" });
      }

      // Other errors
      return res.json({ success: false, message: "Database error" });
    }

    // Success
    res.json({ success: true, message: "Image uploaded successfully" });
  });
});
app.post("/api/slideshow", upload.single("image"), (req, res) => {

  const filePath = req.file.path;
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const imageUrl = "/uploads/" + req.file.filename;

  const sql = `
    INSERT INTO gallery (image_url, image_hash, section)
    VALUES (?, ?, 'slideshow')
  `;

  db.query(sql, [imageUrl, hash], (err) => {
    if (err) {
      fs.unlinkSync(filePath);
      return res.json({ success:false });
    }
    res.json({ success:true });
  });
});

// Update image
app.put("/api/slideshow/:id", upload.single("image"), (req, res) => {

  const id = req.params.id;

  db.query(
    "SELECT image_url FROM gallery WHERE id=? AND section='slideshow'",
    [id],
    (err, rows) => {

      if (!rows.length) return res.json({ success:false });

      fs.unlink(path.join(__dirname, "../frontend", rows[0].image_url), () => {});

      const newUrl = "/uploads/" + req.file.filename;

      db.query(
        "UPDATE gallery SET image_url=? WHERE id=? AND section='slideshow'",
        [newUrl, id],
        () => res.json({ success:true })
      );
    }
  );
});

app.put("/api/gallery/:id", upload.single("image"), (req, res) => {

  const id = req.params.id;

  if (!req.file) {
    return res.json({ success: false });
  }

  db.query(
    "SELECT image_url FROM gallery WHERE id=?",
    [id],
    (err, rows) => {

      if (rows.length > 0) {
        const oldPath = path.join(
          __dirname,
          "../frontend",
          rows[0].image_url
        );
        fs.unlink(oldPath, () => {});
      }

      const newUrl = "/uploads/" + req.file.filename;

      db.query(
        "UPDATE gallery SET image_url=? WHERE id=?",
        [newUrl, id],
        () => res.json({ success: true })
      );
    }
  );
});

// Delete image
app.delete("/api/gallery/:id", (req, res) => {

  const id = req.params.id;

  db.query(
    "SELECT image_url FROM gallery WHERE id=? AND section='gallery'",
    [id],
    (err, rows) => {

      if (!rows.length) {
        return res.json({ success:false, message:"Gallery image not found" });
      }

      const filePath = path.join(__dirname, "../frontend", rows[0].image_url);
      fs.unlink(filePath, () => {});

      db.query(
        "DELETE FROM gallery WHERE id=? AND section='full'",
        [id],
        () => res.json({ success:true })
      );
    }
  );
});

app.delete("/api/slideshow/:id", (req, res) => {

  const id = req.params.id;

  db.query(
    "SELECT image_url FROM gallery WHERE id=? AND section='slideshow'",
    [id],
    (err, rows) => {

      if (!rows.length) {
        return res.json({ success:false });
      }

      const filePath = path.join(__dirname, "../frontend", rows[0].image_url);
      fs.unlink(filePath, () => {});

      db.query(
        "DELETE FROM gallery WHERE id=? AND section='slideshow'",
        [id],
        () => res.json({ success:true })
      );
    }
  );
});
// ================= HOMEPAGE IMAGES =================

// Get ONLY homepage images
app.get("/api/gallery/homepage", (req, res) => {
  const sql = `
    SELECT id, image_url 
    FROM gallery 
    WHERE section = 'homepage'
    ORDER BY id DESC
    LIMIT 8
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.json([]);
    }
    res.json(result);
  });
});

// Add image to HOMEPAGE
app.post("/api/gallery/homepage", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.json({ success: false, message: "No image selected" });
  }

  const filePath = req.file.path;
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const imageUrl = "/uploads/" + req.file.filename;

  const sql = `
    INSERT INTO gallery (image_url, image_hash, section)
    VALUES (?, ?, 'homepage')
  `;

  db.query(sql, [imageUrl, hash], (err) => {
    if (err) {
      fs.unlinkSync(filePath);
      return res.json({ success: false, message: "Duplicate image" });
    }
    res.json({ success: true });
  });
});

// Delete homepage image
app.delete("/api/gallery/homepage/:id", (req, res) => {
  const id = req.params.id;

  db.query(
    "SELECT image_url FROM gallery WHERE id=? AND section='homepage'",
    [id],
    (err, rows) => {
      if (!rows.length) return res.json({ success: false });

      const filePath = path.join(__dirname, "../frontend", rows[0].image_url);
      fs.unlink(filePath, () => {});

      db.query(
        "DELETE FROM gallery WHERE id=? AND section='homepage'",
        [id],
        () => res.json({ success: true })
      );
    }
  );
});

//all services 
app.get("/api/services", (req, res) => {
  db.query(
    "SELECT * FROM services WHERE status=1 ORDER BY id DESC",
    (err, result) => {
      if (err) return res.json([]);
      res.json(result);
    }
  );
});
//add services
app.post("/api/services", (req, res) => {
  const { service_name } = req.body;
  if (!service_name) return res.json({ success:false });

  db.query(
    "INSERT INTO services (service_name) VALUES (?)",
    [service_name],
    err => {
      if (err) return res.json({ success:false });
      res.json({ success:true });
    }
  );
});
//update services 
app.put("/api/services/:id", (req, res) => {
  const { service_name } = req.body;

  db.query(
    "UPDATE services SET service_name=? WHERE id=?",
    [service_name, req.params.id],
    () => res.json({ success:true })
  );
});
//delette services
app.delete("/api/services/:id", (req, res) => {
  db.query(
    "DELETE FROM services WHERE id=?",
    [req.params.id],
    () => res.json({ success:true })
  );
});app.post("/api/contact", (req, res) => {
  const { name, phone, email, message, source } = req.body; // <- include source

  if (!name || !phone || !message) {
    return res.json({ success: false, msg: "Missing required fields" });
  }

  const sql = `
    INSERT INTO contact_messages
    (name, phone, email, message, source)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, phone, email || null, message, source || "Contact"], // use dynamic source
    (err, result) => {
      if (err) return res.json({ success: false, msg: "Database error" });

      const mailOptions = {
        from: `"SK Decor Website" <${process.env.EMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL,
        subject: `New Event Enquiry - SK Decor (${source || "Contact"})`,
        html: `
          <h3>New ${source || "Contact"} Enquiry</h3>
          <p><b>Name:</b> ${name}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Email:</b> ${email || "Not provided"}</p>
          <p><b>Message:</b><br>${message}</p>
        `
      };

      mailer.sendMail(mailOptions, (mailErr) => {
        if (mailErr) return res.json({ success: false, msg: "Mail failed" });

        res.json({ success: true, msg: "Message saved & mail sent" });
      });
    }
  );
});
app.get("/api/dashboard-summary", (req, res) => {
  const q1 = "SELECT COUNT(*) AS gallery FROM gallery";
  const q2 = "SELECT COUNT(*) AS services FROM services";
  const q3 = "SELECT COUNT(*) AS bookings FROM contact_messages WHERE source='Book'";
  const q4 = "SELECT COUNT(*) AS messages FROM contact_messages WHERE source='Contact'";

  db.query(`${q1}; ${q2}; ${q3}; ${q4}`, (err, result) => {
    if (err) return res.json({ error: err });

    res.json({
      gallery: result[0][0].gallery,
      services: result[1][0].services,
      bookings: result[2][0].bookings,
      messages: result[3][0].messages
    });
  });
});

// ONLY Booking Enquiries
app.get("/api/bookings", (req, res) => {
  const sql = `
    SELECT id, name, phone, email, message
    FROM contact_messages
    WHERE source = 'Book'
    ORDER BY created_at DESC
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.json([]);
    }
    res.json(result);
  });
});
// ONLY Contact Messages
app.get("/api/contacts", (req, res) => {
  const sql = `
    SELECT id, name, phone, email, message
    FROM contact_messages
    WHERE source = 'contact'
    ORDER BY created_at DESC
  `;
  db.query(sql, (err, result) => {
    if (err) return res.json([]);
    res.json(result);
  });
});

app.get("/api/admin-profile", (req, res) => {
  const username = req.query.username;

  const sql = "SELECT id, username, email FROM admins WHERE username = ?";
  db.query(sql, [username], (err, result) => {
    if (err || result.length === 0) {
      return res.json({ error: true });
    }

    res.json(result[0]);
  });
});
// UPDATE ADMIN PROFILE
app.put("/api/admin-profile/:id", (req, res) => {
  const { id } = req.params;
  const { username, email } = req.body;

  if (!username || !email) {
    return res.json({ success: false });
  }

  const sql = `
    UPDATE admins 
    SET username = ?, email = ?
    WHERE id = ?
  `;

  db.query(sql, [username, email, id], (err) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});
// DELETE ADMIN PROFILE
app.delete("/api/admin-profile/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM admins WHERE id = ?",
    [id],
    (err) => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
