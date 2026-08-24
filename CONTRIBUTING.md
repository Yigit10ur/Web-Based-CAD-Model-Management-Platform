# Katkı ve Çalışma Kuralları

**Türkçe** · [English](#english)

Bu proje tek geliştiricili ve ~1 aylık bir MVP hedefine sahiptir. Buradaki
kurallar bürokrasi için değil, tek kişilik bir projede en sık kaybedilen iki
şeyi korumak için var: **`main`'in çalışır kalması** ve **kararların
izlenebilirliği**.

## Dallanma modeli

Trunk-based. `develop`, `release/*` veya `hotfix/*` dalı **açılmaz** —
bunların çözdüğü problem (çok geliştirici, paralel sürüm bakımı) bu projede yok.

- **`main`** — tek uzun ömürlü dal. Kural: her zaman build eder.
- **Kısa ömürlü dallar** — bir dikey dilim için açılır, **1–3 günde** merge
  edilir, sonra silinir. Bir dal bir haftayı geçiyorsa dilim fazla büyüktür;
  böl.
- **Squash merge** — her dal `main`'e tek bir anlamlı commit olarak iner.
- Merge sonrası dal silinir (GitHub'da "Automatically delete head branches"
  açık olmalı).

### Dal isimleri

```
feat/viewer-measure-tool     yeni özellik
fix/step-units-mismatch      hata düzeltmesi
chore/vercel-deploy          altyapı, konfigürasyon, bakım
docs/architecture-update     yalnızca doküman
spike/occt-step-to-glb       araştırma — merge EDİLMEZ
```

`spike/` ayrımı bu projede kritiktir. OCCT denemesi planın en riskli parçası ve
**atılmak üzere** yazılacaktır. Spike dalından öğrenilenler temiz bir `feat/`
dalında yeniden yazılır; spike kodu `main`'e sızdırılmaz. Bu, 1 aylık projeyi
6 haftaya çıkaran en klasik hatadır.

## Commit mesajları

Conventional Commits, kısa ve İngilizce:

```
feat(viewer): add point-to-point measurement
fix(converter): correct unit scaling for inch-based STEP files
chore(ci): add typecheck to pull request workflow
docs: update architecture roadmap
```

Kapsam (scope) olarak `viewer`, `converter`, `web`, `db`, `auth` kullanılır.
Dal içindeki ara commit'ler serbesttir (`wip`, `fix typo` sorun değil) — squash
merge sayesinde `main` temiz kalır.

## Pull request

Tek kişilik bir projede bile PR açmanın üç somut karşılığı var:

1. **Preview deployment** — her dal kendi URL'sini alır; viewer gibi görsel bir
   üründe `main`'i bozmadan gerçek bir modeli test edebilmek değerlidir.
2. **Gözden geçirme** — merge'den önce diff'i bir kez bütün olarak okumak.
3. **Çalışma günlüğü** — PR açıklaması, 1 ay sonra "bu kararı neden verdim"
   sorusunun cevabıdır.

PR şablonu [.github/pull_request_template.md](.github/pull_request_template.md)
dosyasındadır. Viewer veya converter'a dokunan her değişiklik PR üzerinden
yürütülür. Doküman ve konfigürasyon değişiklikleri doğrudan `main`'e
gidebilir.

## Sürüm etiketleri

Haftalık kilometre taşları tag'lenir; yol haritasıyla birebir örtüşür:

| Tag | Karşılığı |
|---|---|
| `v0.1-converter` | STEP → glb + metadata uçtan uca çalışıyor |
| `v0.2-viewer` | Viewer çekirdeği: ağaç, seçim, kenarlar |
| `v0.3-tools` | Ölçüm, kesit, patlatma, markup |
| `v0.4-mvp` | Katalog, versiyonlama, izinler, deploy |

## Klasör yapısı

```
/web         → Next.js (TypeScript)
/converter   → FastAPI + OCCT (Dockerfile burada)
/.devcontainer
/.vscode
```

## Kod tarafı

- **TypeScript**: ESLint + Prettier. `any` kullanımı gerekçelendirilmeli.
- **Python**: Ruff (lint + format). Converter'ın giriş noktaları tip
  ipuçlarıyla yazılır.
- **Viewer state**: Görünürlük, seçim ve renk **zustand store'unda** tutulur;
  sahne grafiği doğru kaynak değildir. Bu kuralın gerekçesi
  [ARCHITECTURE.md](ARCHITECTURE.md) bölüm 6'dadır.
- Büyük ikili dosyalar (`.step`, `.glb`) repoya **commit edilmez**; test
  fixture'ları için küçük ve lisansı uygun örnekler kullanılır.

---

## English

[Türkçe](#katkı-ve-çalışma-kuralları) · **English**

This is a single-developer project targeting a ~1 month MVP. These rules exist
to protect the two things most easily lost in a solo project: **keeping `main`
working** and **keeping decisions traceable**.

### Branching model

Trunk-based. No `develop`, `release/*` or `hotfix/*` branches — the problem
they solve (multiple developers, parallel release maintenance) does not exist
here.

- **`main`** — the only long-lived branch. Rule: it always builds.
- **Short-lived branches** — opened for one vertical slice, merged within
  **1–3 days**, then deleted. A branch older than a week means the slice is too
  large; split it.
- **Squash merge** — each branch lands on `main` as one meaningful commit.
- Branches are deleted after merge ("Automatically delete head branches" should
  be enabled).

#### Branch names

```
feat/viewer-measure-tool     new feature
fix/step-units-mismatch      bug fix
chore/vercel-deploy          infrastructure, config, maintenance
docs/architecture-update     documentation only
spike/occt-step-to-glb       research — NOT merged
```

The `spike/` distinction matters here. The OCCT experiment is the riskiest part
of the plan and is written **to be thrown away**. What it teaches is rewritten
cleanly on a `feat/` branch; spike code never leaks into `main`. Letting it leak
is the classic mistake that turns a one-month project into six weeks.

### Commit messages

Conventional Commits, short, in English:

```
feat(viewer): add point-to-point measurement
fix(converter): correct unit scaling for inch-based STEP files
chore(ci): add typecheck to pull request workflow
docs: update architecture roadmap
```

Scopes in use: `viewer`, `converter`, `web`, `db`, `auth`. Intermediate commits
on a branch are free-form (`wip`, `fix typo` are fine) — squash merge keeps
`main` clean.

### Pull requests

Even in a solo project a PR pays for itself three ways:

1. **Preview deployment** — every branch gets its own URL; for a visual product
   like the viewer, testing a real model without breaking `main` is valuable.
2. **Review** — reading the diff as a whole once before merging.
3. **Work log** — the PR description answers "why did I decide this?" a month
   later.

The template lives in
[.github/pull_request_template.md](.github/pull_request_template.md). Anything
touching the viewer or the converter goes through a PR. Documentation and
config changes may go straight to `main`.

### Release tags

Weekly milestones are tagged, matching the roadmap:

| Tag | Meaning |
|---|---|
| `v0.1-converter` | STEP → glb + metadata works end to end |
| `v0.2-viewer` | Viewer core: tree, selection, edges |
| `v0.3-tools` | Measurement, clipping, explode, markup |
| `v0.4-mvp` | Catalogue, versioning, permissions, deployment |

### Repository layout

```
/web         → Next.js (TypeScript)
/converter   → FastAPI + OCCT (Dockerfile lives here)
/.devcontainer
/.vscode
```

### Code conventions

- **TypeScript**: ESLint + Prettier. Any use of `any` needs a justification.
- **Python**: Ruff (lint + format). Converter entry points are type-hinted.
- **Viewer state**: visibility, selection and colour live in the **zustand
  store**; the scene graph is not the source of truth. The reasoning is in
  [ARCHITECTURE.en.md](ARCHITECTURE.en.md) section 6.
- Large binaries (`.step`, `.glb`) are **not committed**; test fixtures use
  small, appropriately licensed samples.
