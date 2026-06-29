# Nhật ký Sessions — Mayintuxa (Remote Print Server)

> File này tự động cập nhật bởi session-logger skill.

---

## Tổng quan Project

**Bắt đầu:** 2026-06-16
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Prisma 6, Neon.tech (PostgreSQL), NextAuth.js, CUPS, IPP.
**Mô tả:** Hệ thống quản lý máy in server từ xa hoạt động trên môi trường Docker/Ubuntu, hỗ trợ phân quyền người dùng, thống kê biểu đồ hoạt động và in ấn qua giao thức mạng.

---

## Tiến độ theo Session

| Ngày | Session | Hoàn thành | Vấn đề chính | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| [2026-06-16](file:///d:/AnhPT/Code/Mayintuxa/sessions/2026-06-16.md) | #1 | Khởi tạo Next.js, cài đặt Prisma Neon DB, phân quyền NextAuth, viết APIs in ấn & quản trị admin, tạo tài liệu Docs và push Git. | Lỗi require-time của ipp, dynamic params của Next.js 15+. | ✅ |
| [2026-06-25](file:///d:/AnhPT/Code/Mayintuxa/sessions/2026-06-25.md) | #2 | Nâng cấp cấu trúc Next.js 16 (Middleware sang Proxy), cấu hình Google OAuth và Neon DB thành công. | Không có. | ✅ |
| [2026-06-25](file:///d:/AnhPT/Code/Mayintuxa/sessions/2026-06-25.md) | #3 | Fix `Unknown attribute: device-uri` (rewrite IPP binary thủ công RFC 2910), fix HTTP 401 CUPS (cupsd.conf no-auth), thêm PWA (manifest + SW + icons), đổi tên app MayInKTS. | ipp library không biết CUPS extensions; CUPS PAM auth block. | ✅ |
| [2026-06-27](file:///d:/AnhPT/Code/Mayintuxa/sessions/2026-06-27.md) | #4 | (Đa dự án) Fix OSIRIS (lỗi React hook + CartoCDN), Fix Mayintuxa lỗi HMR Hook mismatch và lỗi CUPS IPv6 AggregateError. Push thành công. | React Hooks desync do HMR; AggregateError do IPv6 vs IPv4 phân giải localhost | ✅ |

---

## Vấn đề đang mở (Open Issues)
- [ ] Deploy lên Ubuntu server với config mới: `docker compose down && docker compose pull && docker compose up -d`. — *Từ ngày 2026-06-25*
- [ ] Test đăng ký máy in thật sau khi tắt `MOCK_PRINTING=false`. — *Từ ngày 2026-06-25*
- [ ] Xem xét firewall UFW để hạn chế port 6315 từ internet. — *Từ ngày 2026-06-25*
- [x] ~~Lỗi `Unknown attribute: device-uri` khi đăng ký CUPS printer~~ — *Fix ngày 2026-06-25*
- [x] ~~Triển khai chạy Docker Compose trên Ubuntu Server~~ — *Fix ngày 2026-06-25 (cơ bản)*

---

## Quyết định kỹ thuật (ADR Summary)
- **2026-06-25:** Viết IPP binary packet thủ công (RFC 2910) thay vì dùng serializer `ipp` npm — tránh giới hạn attribute registry, hoạt động với CUPS extensions.
- **2026-06-25:** Xóa CUPS HTTP auth, delegate hoàn toàn cho Next.js — đơn giản hóa stack Docker nội bộ.
- **2026-06-25:** PWA native Next.js 16 (manifest.ts + custom sw.js) thay vì `next-pwa` — tương thích App Router tốt hơn, không thêm dependency.
- **2026-06-25:** Di chuyển `middleware.ts` sang `proxy.ts` để tuân thủ deprecation rules của Next.js 16.
- **2026-06-16:** Sử dụng Prisma 6 thay vì Prisma 7 để giữ cấu trúc schema truyền thống đơn giản, ổn định.
- **2026-06-16:** Tự phát triển các biểu đồ SVG dạng thô để tối ưu hóa bundle size và loại bỏ xung đột thư viện chart.
- **2026-06-16:** Thêm biến môi trường `MOCK_PRINTING` để giả lập lệnh in khi máy in thực tế chưa trực tuyến.
- **2026-06-27:** Gỡ bỏ `useEffect` lưu Connection URI để fix dứt điểm lỗi React HMR hook count mismatch cho user mà không cần Hard Reload, chuyển sang build inline lúc submit.
- **2026-06-27:** Bắt buộc Node.js gọi CUPS qua IPv4 (`127.0.0.1:6315` thay vì `localhost:6315`) để tránh lỗi Node 18 AggregateError phân giải IPv6/IPv4 trên môi trường Docker của Windows.
