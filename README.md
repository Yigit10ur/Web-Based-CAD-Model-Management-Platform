# Web Based CAD Model Management Platform

**English** · [Türkçe](#türkçe)

A web based CAD model management platform.

## About

This project aims to build a platform for uploading, versioning, viewing and
sharing CAD models (STEP, IGES, STL, DWG and similar formats) over the web.

## Planned Features

- Uploading and storing CAD files
- Version (revision) tracking
- In-browser 3D model preview
- Metadata and search
- User and permission management

## Development

```
/web         → Next.js (TypeScript) — catalogue and 3D viewer
/converter   → FastAPI + OCCT — CAD conversion service
```

```bash
cd web && npm install && npm run dev            # http://localhost:3000
cd converter && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```

Full setup for each service lives in its own README:
[web/README.md](web/README.md) · [converter/README.md](converter/README.md)

Working conventions and branching model: [CONTRIBUTING.md](CONTRIBUTING.md)

## Documentation

For the architecture, technology choices and roadmap see
[ARCHITECTURE.en.md](ARCHITECTURE.en.md).

## Status

The project is at an early stage.

---

## Türkçe

[English](#web-based-cad-model-management-platform) · **Türkçe**

Web tabanlı bir CAD model yönetim platformu.

### Hakkında

Bu proje, CAD modellerinin (STEP, IGES, STL, DWG vb.) web üzerinden
yüklenmesi, sürümlenmesi, görüntülenmesi ve paylaşılması için bir platform
geliştirmeyi amaçlar.

### Planlanan Özellikler

- CAD dosyalarının yüklenmesi ve depolanması
- Sürüm (revizyon) takibi
- Tarayıcı üzerinden 3D model önizleme
- Metadata ve arama
- Kullanıcı ve yetki yönetimi

### Geliştirme

```
/web         → Next.js (TypeScript) — katalog ve 3B viewer
/converter   → FastAPI + OCCT — CAD dönüştürme servisi
```

```bash
cd web && npm install && npm run dev            # http://localhost:3000
cd converter && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```

Her iki servisin ayrıntılı kurulumu kendi README dosyalarındadır:
[web/README.md](web/README.md) · [converter/README.md](converter/README.md)

Çalışma kuralları ve dal modeli: [CONTRIBUTING.md](CONTRIBUTING.md)

### Dokümantasyon

Mimari, teknoloji seçimleri ve yol haritası için: [ARCHITECTURE.md](ARCHITECTURE.md)

### Durum

Proje başlangıç aşamasındadır.
