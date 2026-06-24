# Ringkasan Fitur AI - AI Video Clipper Studio

Dokumen ini menyajikan daftar dan penjelasan fitur-fitur bertenaga Kecerdasan Buatan (AI) yang ada dalam proyek **AI Video Clipper Studio**. Fitur penyuntingan video standar (seperti pemotongan manual, pratinjau, penggabungan video, dsb.) tidak termasuk dalam daftar ini.

---

### 1. Deteksi Klip Viral Otomatis
* **Analisis Konten Berpotensi Viral:** AI menganalisis transkrip percakapan video untuk mengidentifikasi bagian-bagian terbaik yang paling menarik bagi penonton (seperti kalimat pembuka yang memikat/*hook*, poin klimaks pembahasan, atau kutipan penting).
* **Rekomendasi Judul Kreatif:** AI secara otomatis membuat judul klip yang menarik perhatian penonton dan relevan dengan topik yang dibahas.
* **Analisis Rekomendasi Klip:** AI memberikan alasan logis mengapa segmen video tersebut direkomendasikan untuk dipotong menjadi klip pendek (TikTok, Instagram Reels, atau YouTube Shorts).

### 2. Transkripsi & Subtitel Otomatis Berpresisi Tinggi
* **Transkripsi Suara-ke-Teks (Speech-to-Text):** Mengubah seluruh percakapan dalam video menjadi teks secara otomatis.
* **Penyelarasan Waktu (Timestamping) Tingkat Kata:** Menentukan stempel waktu yang sangat akurat untuk setiap kata atau frasa pendek, memastikan teks muncul tepat saat kata diucapkan dan hilang segera setelah kata selesai diucapkan.
* **Penyorotan Kata Aktif Dinamis (Word-by-Word Highlight):** Menyorot secara dinamis kata yang sedang diucapkan oleh pembicara dengan warna yang berbeda secara waktu-nyata, menciptakan efek teks yang interaktif dan modern.

### 3. Deteksi Wajah & Pemotongan Portrait Cerdas (Smart Cropping)
* **Deteksi Wajah Otomatis (Face Detection):** Mendeteksi keberadaan dan posisi wajah pembicara di setiap frame video secara otomatis.
* **Pelacakan Aktif Pembicara (Active Speaker Tracking):** Melacak wajah pembicara dan memotong video berformat lanskap (horizontal) menjadi vertikal (portrait 9:16) secara cerdas agar wajah pembicara selalu berada di tengah-tengah layar.
* **Mode Pemotongan Stabil & Dinamis:**
  * *Mode Stabil:* Menjaga pergerakan kamera potong tetap stabil dengan meredam getaran akibat gerakan-gerakan kecil pembicara (seperti menoleh atau mengangguk).
  * *Mode Dinamis:* Mengikuti pergerakan wajah pembicara secara instan dari frame ke frame.

### 4. Penyisipan Footage Otomatis (Smart B-Roll Overlay)
* **Deteksi Konsep Visual:** AI mengidentifikasi topik atau kata kunci percakapan yang merujuk pada konsep visual tertentu (seperti "bisnis", "teknologi", "uang", "grafik naik").
* **Pembuatan Kueri Pencarian Otomatis:** Menghasilkan kata kunci pencarian visual yang relevan berdasarkan konsep yang sedang dibicarakan.
* **Penyisipan Video B-Roll:** Mencari, mengunduh, dan menyisipkan klip footage tambahan (B-roll) yang relevan sebagai overlay visual untuk memperkaya isi video secara otomatis.

---

### 5. Pemotongan Hening Otomatis (Silence Cut)
* **Deteksi Jeda Suara Otomatis:** AI menganalisis level desibel audio (RMS dan peak) sepanjang video untuk mendeteksi area hening di mana pembicara tidak mengeluarkan suara.
* **Pemotongan Jeda Hening Sekaligus:** Secara otomatis memotong dan menghapus semua segmen hening (silence) di timeline untuk menciptakan alur video yang lebih cepat, padat, dan dinamis (jump-cut khas konten modern).
* **Pengaturan Buffer/Padding Jeda:** Pengguna dapat menentukan ambang batas hening (desibel), durasi minimum hening, serta batas keamanan (padding) sebelum dan sesudah jeda agar potongan tidak memotong kata secara kasar.

### 6. Sinkronisasi Beat Musik (Beat Sync)
* **Deteksi Ketukan Musik (Beat Detection):** AI menganalisis transisi energi audio dan melodi musik latar untuk menandai setiap ketukan (beat) pada trek audio.
* **Sinkronisasi Klip ke Beat:** Menyelaraskan pergantian klip video secara otomatis tepat pada ketukan musik yang terdeteksi, menghasilkan suntingan video dengan ritme visual yang seirama dengan alunan musik.
* **Pola Transisi Fleksibel:** Menawarkan opsi interval ketukan (misal: ganti klip setiap 1 beat, 2 beat, atau 4 beat) agar pacing video sesuai dengan ketegangan cerita.

### 7. Penghapusan Latar Belakang Real-time (Background Removal)
* **Segmentasi Wajah & Tubuh Manusia (Person Segmentation):** Menggunakan model AI berbasis visi untuk memisahkan objek manusia (pembicara) dari latar belakang fisiknya secara waktu-nyata tanpa memerlukan green screen fisik.
* **Efek Chroma Key Otomatis:** Secara cerdas menerapkan filter pemotongan latar belakang hijau (green screen) virtual dengan toleransi warna dan batas yang dapat disesuaikan untuk isolasi objek berkualitas tinggi.
* **Penggantian Latar Belakang Mandiri:** Memungkinkan pengguna untuk menyisipkan gambar, video lain, atau efek khusus di bawah objek pembicara yang telah diisolasi.

