# Web Based CAD Model Management Platform

[![CI](https://github.com/Yigit10ur/Web-Based-CAD-Model-Management-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Yigit10ur/Web-Based-CAD-Model-Management-Platform/actions/workflows/ci.yml)

**English** · [Türkçe](#türkçe)

Upload a CAD assembly and inspect it in the browser: walk the part tree, read
exact mass properties, measure between corners, and cut a section through it.

Most web CAD viewers show you a mesh. The interesting part of a CAD file is not
its mesh — it is the geometry the mesh approximates. This project keeps that
distinction: the browser is sent triangles to draw, but every number it reports
comes from the B-rep the CAD file actually contains.

## What it does

**Inspection**

- Assembly tree with the part names and colours from the source file
- Selection down to a single B-rep face, not just a part
- Exact volume, surface area, centre of mass and bounding box — computed from
  the B-rep, never measured off the triangles. A mesh upload is labelled as
  measured instead, and the viewer says so rather than letting the numbers
  pass for exact
- Point-to-point measurement that snaps to real vertices and edges; a circular
  edge reports the diameter from its CAD definition rather than from the
  polygon approximating it
- Section plane, capped with the stencil buffer so a cut solid reads as solid
  rather than as a hollow shell
- Exploded view, isolate and hide, and a true edge overlay

**Platform**

- Upload straight from the browser to object storage with a presigned URL
- Native Inventor parts and assemblies, translated to STEP by an agent running
  on a machine that has Inventor licensed
- Conversion runs as a background worker off a database-backed queue
- Every model belongs to a project, and every read and write is checked
  against it
- Sign in with GitHub

## How it works

A CAD file is read once, on the server, by OpenCascade. That pass produces two
things:

    model.glb        one node per part, plus the B-rep edges as line primitives
    metadata.json    assembly tree, exact mass properties, face groups,
                     and the vertices and edge definitions measurements snap to

The viewer reads nothing else. A triangle on screen is only ever used to decide
*which* piece of geometry the user meant; the answer then comes from
`metadata.json`. That is why a corner-to-corner measurement across a 40 × 20
plate reads 44.72 mm and not 44.7-something.

The full reasoning, including the alternatives that were rejected, is in
[ARCHITECTURE.en.md](ARCHITECTURE.en.md).

## Layout

```
/web         Next.js — catalogue, API and the 3D viewer
/converter   FastAPI + OpenCascade — conversion and the queue worker
/agent       Windows service that translates Inventor files with Inventor
```

## Getting started

The viewer runs on its own, with no database, storage or account:

```bash
cd web && npm install && npm run dev
```

Then open <http://localhost:3000/sample>.

For the whole platform you also need Postgres and S3-compatible storage
(Supabase provides both):

```bash
cd web
cp .env.example .env.local     # fill in, see the comments in the file
npm run db:migrate
npm run dev

cd ../converter
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,cad]"
python -m app.worker
```

Per-service detail: [web/README.md](web/README.md) ·
[converter/README.md](converter/README.md)

## Status

Working end to end: sign in, upload a STEP file, watch it convert, open it and
inspect it.

Not built yet: markup, angle measurement, an off-axis section plane, search and
filtering, thumbnails, and a projects and sharing interface. Nothing is
deployed yet, so there is no live URL.

## Contributing

Working conventions and the branching model: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)

---

## Türkçe

[English](#web-based-cad-model-management-platform) · **Türkçe**

Bir CAD montajını yükleyip tarayıcıda inceleyin: parça ağacında gezin, exact
kütle özelliklerini okuyun, köşeler arası ölçüm yapın, içinden kesit alın.

Web tabanlı CAD görüntüleyicilerin çoğu size bir mesh gösterir. Oysa bir CAD
dosyasının ilginç kısmı mesh'i değil, mesh'in yaklaştırdığı geometridir. Bu
proje o ayrımı korur: tarayıcıya çizmesi için üçgenler gönderilir, ama
raporlanan her sayı dosyanın gerçekten içerdiği B-rep'ten gelir.

### Neler yapıyor

**İnceleme**

- Kaynak dosyadan gelen parça isimleri ve renkleriyle montaj ağacı
- Yalnızca parça değil, tek bir B-rep yüzeyine kadar seçim
- Exact hacim, yüzey alanı, ağırlık merkezi ve sınır kutusu — B-rep'ten
  hesaplanır, üçgenlerden ölçülmez. Mesh yüklemesi "ölçülmüş" olarak
  etiketlenir ve viewer bunu açıkça söyler, sayıların exact sanılmasına izin
  vermez
- Gerçek köşe ve kenarlara snap olan nokta-nokta ölçüm; çember bir kenar,
  kendisini yaklaştıran çokgenden değil CAD tanımından gelen çapı bildirir
- Stencil ile kapatılmış kesit düzlemi — kesilen katı, boş bir kabuk değil
  katı olarak okunur
- Patlatılmış görünüm, izole etme ve gizleme, gerçek kenar katmanı

**Platform**

- Tarayıcıdan doğrudan nesne depolamaya presigned URL ile yükleme
- Native Inventor parça ve montajları, Inventor lisanslı bir makinede çalışan
  ajan tarafından STEP'e çevrilerek
- Dönüştürme, veritabanı destekli bir kuyruktan beslenen arka plan worker'ında
- Her model bir projeye ait ve her okuma/yazma buna karşı denetleniyor
- GitHub ile giriş

### Nasıl çalışıyor

CAD dosyası sunucuda, OpenCascade tarafından bir kez okunur. Bu geçiş iki şey
üretir:

    model.glb        parça başına bir düğüm, artı B-rep kenarları çizgi olarak
    metadata.json    montaj ağacı, exact kütle özellikleri, yüz grupları ve
                     ölçümlerin snap olduğu köşe/kenar tanımları

Viewer başka hiçbir şey okumaz. Ekrandaki üçgen yalnızca kullanıcının *hangi*
geometriyi kastettiğine karar vermek için kullanılır; cevap `metadata.json`'dan
gelir. 40 × 20 bir plakanın köşeden köşeye ölçümünün 44.72 mm çıkması, yaklaşık
bir şey çıkmaması bundandır.

Reddedilen alternatifler dahil gerekçelerin tamamı
[ARCHITECTURE.md](ARCHITECTURE.md) dosyasındadır.

### Dizin yapısı

```
/web         Next.js — katalog, API ve 3B viewer
/converter   FastAPI + OpenCascade — dönüştürme ve kuyruk worker'ı
/agent       Inventor dosyalarını Inventor ile çeviren Windows servisi
```

### Başlarken

Viewer tek başına, veritabanı, depolama veya hesap olmadan çalışır:

```bash
cd web && npm install && npm run dev
```

Sonra <http://localhost:3000/sample> adresini açın.

Platformun tamamı için ayrıca Postgres ve S3 uyumlu depolama gerekir
(Supabase ikisini birden verir):

```bash
cd web
cp .env.example .env.local     # doldurun, açıklamalar dosyanın içinde
npm run db:migrate
npm run dev

cd ../converter
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,cad]"
python -m app.worker
```

Servis bazında ayrıntı: [web/README.md](web/README.md) ·
[converter/README.md](converter/README.md)

### Durum

Uçtan uca çalışıyor: giriş yap, STEP dosyası yükle, dönüşmesini izle, aç ve
incele.

Henüz yok: markup, açı ölçümü, eksen dışı kesit düzlemi, arama ve filtreleme,
küçük resim üretimi, proje ve paylaşım arayüzü. Hiçbir yere deploy edilmedi,
dolayısıyla canlı bir adres yok.

### Katkı

Çalışma kuralları ve dal modeli: [CONTRIBUTING.md](CONTRIBUTING.md)

### Lisans

[MIT](LICENSE)
