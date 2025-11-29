// app.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import pool from './db.js';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// View 엔진
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 정적 파일
app.use("/public", express.static(path.join(__dirname, "public")));

// Form 파서
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}));

// JSON 파서
app.use(express.json({
  limit: '10mb',
}));

// ================================
// 세션 (로그인/게스트 구분)
// ================================
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'portfolio-hub-secret',
    resave: false,
    saveUninitialized: false,
  })
);

// 모든 페이지에서 isAdmin 사용 가능
app.use((req, res, next) => {
  res.locals.isAdmin = !!req.session.isAdmin;
  next();
});

// 관리자 전용 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(403).send('관리자만 접근 가능합니다.');
  }
  next();
}

// ================================
// Toast UI 이미지 업로드
// ================================
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename =
        Date.now() + "-" + Math.random().toString(36).substring(2) + ext;
      cb(null, filename);
    },
  }),
});

// 이미지 업로드 API
app.post("/upload-image", upload.single("image"), (req, res) => {
  res.json({
    url: `/public/uploads/${req.file.filename}`,
  });
});

// ================================
// 로그인 관련 라우트
// ================================

// 로그인 페이지
app.get("/login", (req, res) => {
  res.render("login", {
    title: "관리자 로그인",
    error: null,
  });
});

// 로그인 처리
app.post("/login", (req, res) => {
  const { password } = req.body;

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234"; // 원하는 값으로 바꿔도 됨

  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/");
  }

  res.render("login", {
    title: "관리자 로그인",
    error: "비밀번호가 틀렸습니다.",
  });
});

// 게스트 모드 (isAdmin = false)
app.post("/guest", (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/");
});

// 로그아웃
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ================================
// 포트폴리오 라우트
// ================================

// 목록
app.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, summary, link_url, created_at
      FROM portfolio_posts
      ORDER BY created_at DESC
    `);

    res.render("index", {
      title: "선웅이 포트폴리오 허브",
      posts: rows,
    });
  } catch (err) {
    next(err);
  }
});

// 상세
app.get("/post/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM portfolio_posts WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).send("글을 찾을 수 없습니다.");

    res.render("post_detail", {
      title: rows[0].title,
      post: rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// 작성 폼 - 관리자만
app.get("/admin/write", requireAdmin, (req, res) => {
  res.render("post_form", {
    title: "포트폴리오 글 작성",
    mode: "create",
    post: { title: "", summary: "", content: "", link_url: "" },
  });
});

// 작성 처리 - 관리자만
app.post("/admin/write", requireAdmin, async (req, res, next) => {
  const { title, summary, content, link_url } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO portfolio_posts (title, summary, content, link_url)
      VALUES (?, ?, ?, ?)
    `,
      [title, summary, content, link_url]
    );

    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// 수정 폼 - 관리자만
app.get("/admin/edit/:id", requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM portfolio_posts WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) return res.status(404).send("글을 찾을 수 없습니다.");

    res.render("post_form", {
      title: "포트트폴리오 글 수정",
      mode: "edit",
      post: rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// 수정 처리 - 관리자만
app.post("/admin/edit/:id", requireAdmin, async (req, res, next) => {
  const { title, summary, content, link_url } = req.body;

  try {
    await pool.query(
      `
      UPDATE portfolio_posts
      SET title=?, summary=?, content=?, link_url=?
      WHERE id = ?
    `,
      [title, summary, content, link_url, req.params.id]
    );

    res.redirect(`/post/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// 삭제 - 관리자만
app.post("/admin/delete/:id", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM portfolio_posts WHERE id=?", [
      req.params.id,
    ]);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("서버 에러 발생");
});

app.listen(PORT, () =>
  console.log(`🚀 Portfolio Hub is running on http://localhost:${PORT}`)
);
