# Installing EhsimCAD on your own server

For the team doing the install. It assumes no knowledge of the application, and
it assumes nobody from the project is in the room -- so everything needed to
finish, and to work out what went wrong, is in this file.

Everything is configuration: the same build runs in every environment, and no
secret is baked into it.

**Türkçe özet en altta.**

---

## Start here

Four steps, in this order. Each one is explained further down.

```
cp .env.deploy.example .env.deploy    # fill it in
docker compose run --rm preflight     # must say Ready
docker compose run --rm migrate       # creates the tables
docker compose up -d
```

If `run` reports that the service does not exist, the Compose version is old
enough to need the profile named: `docker compose --profile tools run --rm
preflight`. The two tools are in a profile so that `up` does not start them as
services.

Three rules. They are the whole of what installs get wrong:

**1. Do not start anything until `preflight` says Ready.** It is the closest
thing to someone to ask. It connects to the real database and writes a real
object to the real bucket, then names what is wrong in a sentence you can act
on -- which key is rejected, which bucket is missing, which address does not
resolve. A failure here is a five-minute fix; the same failure discovered after
the service is up looks like the application is broken.

**2. The storage address has to work from users' desktops, not just from the
server.** Browsers upload files straight to object storage, never through the
application. An address that resolves only inside the data centre passes every
check on the server and fails every upload on every machine. See
[Read this before you configure anything](#read-this-before-you-configure-anything).

**3. The bucket must allow cross-origin requests from the site's address.**
Same reason. The browser sends `OPTIONS` before it sends the file. Allow the
origin, the methods `GET`, `PUT`, `HEAD`, and the `content-type` header.

If something goes wrong later, [When something is wrong](#when-something-is-wrong)
lists what each symptom actually means.

---

## What it is

Two long-running processes.

| | What it does | Reached by |
|---|---|---|
| **web** | Serves the site and the API. Node, listens on 3000. | People, through your reverse proxy |
| **worker** | Converts uploaded CAD files. Python + OpenCascade. | Nothing — it connects out |

They share a Postgres database and one object-storage bucket, and never speak
to each other directly. An upload becomes a row in a queue table; the worker
picks it up. Stopping the worker does not stop the site — uploads simply wait.

---

## What you need to provide

**Postgres 14 or newer.** One database and a user that owns it. The
application creates its own tables.

**S3-compatible object storage.** One bucket and one key pair that can read,
write and delete in it. MinIO, Ceph, StorageGRID and AWS S3 all work. A model
costs the uploaded file plus about 4–6 MB derived from it, kept per revision,
and nothing is removed unless somebody deletes a model.

**A host with 2 GB of RAM**, which is comfortable for both processes together.
Measured: the worker peaked at 435 MB converting a 500-part assembly and
344 MB converting a three-part one. Almost all of that is OpenCascade itself
being loaded — the part that grows with the model is smaller than the fixed
cost, so a bigger assembly does not need a bigger machine nearly as fast as you
would expect. Conversion is single-threaded and takes seconds; the same
500-part assembly took 5.5 s.

**A reverse proxy** for TLS. It does not terminate TLS itself. It does not
need a large body limit either — see the next section for why.

---

## Read this before you configure anything

**Browsers upload directly to object storage, not through the application.**
The web application signs a URL and hands it to the browser, which then PUTs
the file straight to the bucket. A 200 MB assembly never passes through Node.

Two consequences, and they are the two things installs get wrong:

1. **`STORAGE_ENDPOINT` must be reachable from your users' browsers**, not only
   from the server. An address that resolves inside the data centre and nowhere
   else will pass every check on the server and fail every upload on every
   desktop.

2. **The bucket must allow cross-origin requests from `SITE_URL`.** The browser
   sends a preflight `OPTIONS` before the `PUT`. Allow the origin, the methods
   `GET`, `PUT` and `HEAD`, and the `content-type` header. On MinIO this is the
   bucket's CORS configuration; some builds allow everything by default, which
   is why this only bites on the ones that do not.

The upside of the same design: your proxy never carries a 200 MB body, so
`client_max_body_size` and upload timeouts do not need raising.

---

## Install

### Configure

```
cp .env.deploy.example .env.deploy
```

Fill it in. Every value is explained in the file. The four that have no
sensible default are `DATABASE_URL`, the storage credentials, `AUTH_SECRET`
(`openssl rand -base64 32`) and `SITE_URL`.

### Check the configuration before anything runs

```
docker compose run --rm preflight
```

Without Docker:

```
cd web && npm ci && node --env-file=../.env.deploy scripts/preflight.mjs
```

It connects to the database, checks the schema is up to date, and writes,
reads back and deletes a test object in the bucket. It names what is wrong and
exits non-zero. **Do not skip this**: every check in it stands for a failure
that is otherwise silent or reported as something else.

Warnings are not failures. They list what is switched off — email delivery,
GitHub sign-in — so nothing is a surprise later.

### Create the schema

```
docker compose run --rm migrate
```

Without Docker: `cd web && npx drizzle-kit migrate`

Run it once, and again after every upgrade. It is deliberately not automatic:
a schema change that runs by itself is a schema change nobody read.

### Start

```
docker compose up -d
```

Without Docker, see **Running it without containers** below.

---

## Check that it works

```
curl -fsS http://localhost:3000/api/health
```

`{"status":"ok","database":true}`. It answers 503 when the database is
unreachable, which is the condition worth taking an instance out of rotation
for. It needs no authentication.

Then, in a browser, end to end:

1. Open `SITE_URL`, create an account, sign in.
2. Upload a STEP file. It should show `queued`, then `converting`, then
   `ready` — under a minute for a typical assembly.
3. Open it. The part tree, the properties panel and the section control should
   all work.

If it stays `queued`, the worker is not running or cannot see the queue:

```
docker compose logs worker        # or: journalctl -u ehsimcad-worker -f
```

---

## When something is wrong

| What you see | What it is |
|---|---|
| Upload fails in the browser, server looks fine | The browser cannot reach `STORAGE_ENDPOINT`, or the bucket rejects the cross-origin request. Look at the browser's network tab: a failed `OPTIONS` is CORS, a failed connection is the address. |
| Model stays `queued` for ever | No worker running, or it cannot reach the database. The queue is a table — nothing is lost, it converts as soon as a worker starts. |
| Worker will not start | It refuses to run when OpenCascade is not importable, rather than accepting jobs and failing all of them. The log says so on the first line. |
| Model goes `failed` | The file itself. `error_message` on the version row, and the worker log, say why. Other uploads are unaffected. |
| Sign-in loops back to the sign-in page | `AUTH_SECRET` is unset or differs between instances behind a load balancer. |
| "Continue with GitHub" errors | The OAuth application's callback must be exactly `SITE_URL` + `/api/auth/callback/github`. Leave `AUTH_GITHUB_*` empty to switch it off entirely. |
| Password reset email never arrives | Expected with no `MAIL_API_KEY`: the message is written to the web log instead. |
| Everyone signed out after a restart | `AUTH_SECRET` is being regenerated instead of kept. |

---

## Running it without containers

**Web.** Node 22.

```
cd web
npm ci
BUILD_STANDALONE=1 npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
```

`BUILD_STANDALONE=1` asks for a self-contained server at
`.next/standalone/server.js` — the server plus only the dependencies it
actually reaches. Without it you get an ordinary build, which needs the whole
`node_modules` tree beside it and is started with `npm start` instead.

The build does not copy the static files into the standalone directory: they
are served, not imported, so Next.js leaves them where they are. The two `cp`
lines above are what the container image does; miss them and the site loads
with no styling and no icons.

**Worker.** Python 3.12.

```
cd converter
python3.12 -m venv .venv
.venv/bin/pip install ".[cad]"
```

OpenCascade arrives as a wheel and needs a few system libraries beside it:
`libgl1`, `libglu1-mesa`, `libxrender1`, `libxext6`. It is about 220 MB
installed.

**Both as services.** `deploy/systemd/` holds a unit for each. Adjust the
paths and the user, then:

```
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ehsimcad-web ehsimcad-worker
```

---

## Operating it

**Logs.** `docker compose logs -f web worker`, or `journalctl -u ehsimcad-web
-f`. Both processes log to stdout.

**Restarting.** Safe at any time. The worker finishes the job it is on before
exiting, and a job interrupted anyway is picked up again after
`STALE_JOB_SECONDS` — a crashed worker does not lose an upload.

**More conversion capacity.** Run more workers. Two of them take different
jobs rather than the same one; the queue guarantees it. There is nothing to
configure.

**Backups.** The database and the bucket, together. Either one alone restores
to a catalogue whose files are missing, or files nothing points at.

**Upgrading.** Pull, rebuild, run the migration, restart. In that order —
starting new code against an old schema is the one ordering that breaks.

---

## Known limits

**Email needs an HTTPS provider, not SMTP.** The mail path posts to a provider
over HTTPS. An internal SMTP relay is not supported yet. Until it is, leave
`MAIL_API_KEY` empty: everything works except password reset and address
confirmation, and the messages go to the log where they can be read.

**GitHub sign-in needs the internet**, both from the server and from the
browser. On a closed network, leave it off and use email and password.

**The whole model is downloaded before it is drawn.** Fine for the assemblies
tested — 1.7 MB of geometry and 2 MB of metadata for eleven parts — and not a
design for 50 MB models.

**Deleting a model while it is converting** can leave two files in the bucket
that nothing points at. Seconds-wide, and it costs storage, not correctness.

---

## What has not been tested

Both images have now been built and run, on an arm64 Mac under Colima, against
a real Postgres and a real S3 bucket:

| Step | Result |
|---|---|
| `docker compose build` | both images build |
| `docker compose run --rm preflight` | connects, checks the schema, writes and reads back a test object |
| `docker compose run --rm migrate` | applies the migrations |
| `docker compose up -d` | web healthy, worker polling |
| the site, from outside the container | `/api/health`, `/sign-in` and the viewer all answer |
| a real STEP file put in the queue | the worker converted it, 7428 triangles, about four seconds |

Images: **457 MB** for the web, **2.0 GB** for the converter, which is
OpenCascade.

**Not tried: `systemctl start`.** There is no systemd on the machine this was
developed on, so the unit files are written from the install steps rather than
from a run.

**Not tried: MinIO, or any storage other than Supabase's.** Both are spoken to
over standard protocols and the S3 client is already configured for path-style
addressing, which is what MinIO needs — but MinIO itself has not been used.

**Not tried: x86-64.** The images were built on arm64. The base images exist
for both, and nothing here is architecture-specific, but the build has only
been run on one.

The preflight check is the thing to trust: it exercises the real database and
the real bucket, whatever they turn out to be.


---

## Türkçe özet

Bu bölüm yukarıdakinin kısaltılmış hâli. Ayrıntı için İngilizce bölümlere bakın;
komutlar aynıdır.

### Ne kuruyorsunuz

Sürekli çalışan iki süreç: **web** (Node, 3000 portu, sitenin kendisi) ve
**worker** (Python + OpenCascade, yüklenen CAD dosyalarını dönüştürür). İkisi
bir Postgres veritabanını ve bir nesne depolama kovasını paylaşır, birbirleriyle
hiç konuşmaz. Worker durursa site çalışmaya devam eder, yüklemeler sırada
bekler.

### Sizden istenenler

Postgres 14+ (bir veritabanı ve onu sahiplenen bir kullanıcı), S3 uyumlu bir
depolama kovası ve okuma/yazma/silme yapabilen bir anahtar çifti, 2 GB RAM'lik
bir sunucu, ve TLS için önünde bir ters vekil. Vekilin büyük gövde limitine
ihtiyacı yok — dosyalar uygulamanın üzerinden geçmiyor.

### Sıra

```
cp .env.deploy.example .env.deploy    # doldurun
docker compose run --rm preflight     # "Ready" demeli
docker compose run --rm migrate       # tabloları oluşturur
docker compose up -d
```

`.env.deploy` içindeki her ayarın ne işe yaradığı dosyanın kendi içinde
yazılıdır. Varsayılanı olmayan dört değer: `DATABASE_URL`, depolama
kimlik bilgileri, `AUTH_SECRET` (`openssl rand -base64 32`) ve `SITE_URL`.

### Üç kural

**1. `preflight` "Ready" demeden hiçbir şey başlatmayın.** Bu komut gerçek
veritabanına bağlanır, gerçek kovaya gerçek bir nesne yazar, geri okur ve siler.
Sonra neyin yanlış olduğunu tek cümleyle söyler: hangi anahtar reddedildi,
hangi kova yok, hangi adres çözülemedi. Burada beş dakikada çözülen bir sorun,
servis ayağa kalktıktan sonra "uygulama bozuk" gibi görünür.

**2. Depolama adresi kullanıcıların bilgisayarından erişilebilir olmalı**,
yalnızca sunucudan değil. Tarayıcı dosyayı doğrudan depolamaya yükler, hiçbir
zaman uygulamanın üzerinden geçmez. Sadece veri merkezi içinden çözülen bir
adres sunucudaki her testi geçer ve her masaüstünde yüklemeyi başarısız kılar.

**3. Kova, sitenin adresinden gelen çapraz kaynak isteklerine izin vermeli.**
Aynı sebep. Tarayıcı dosyayı göndermeden önce `OPTIONS` gönderir. Kaynağa,
`GET` / `PUT` / `HEAD` metotlarına ve `content-type` başlığına izin verin.

### Çalıştığını doğrulama

```
curl -fsS http://localhost:3000/api/health
```

`{"status":"ok","database":true}` beklenir. Veritabanına ulaşılamıyorsa 503
döner. Kimlik doğrulama istemez.

Sonra tarayıcıdan: hesap açın, giriş yapın, bir STEP dosyası yükleyin. `queued`
→ `converting` → `ready` sırasını izlemeli, tipik bir montaj için bir dakikadan
kısa sürede. Sonra modeli açın; parça ağacı, özellikler paneli ve kesit
kontrolü çalışmalı.

`queued` durumunda takılı kalıyorsa worker çalışmıyordur ya da veritabanını
göremiyordur — `docker compose logs worker`. Kuyruk bir veritabanı tablosudur:
hiçbir şey kaybolmaz, worker başlar başlamaz dönüşüm yapılır.

### Sorun çıkarsa

Belirtilerin ne anlama geldiği [When something is wrong](#when-something-is-wrong)
tablosunda. En sık çıkanlar:

| Gördüğünüz | Sebebi |
|---|---|
| Tarayıcıda yükleme başarısız, sunucu sağlıklı | Tarayıcı depolama adresine ulaşamıyor ya da kova CORS'a izin vermiyor. Tarayıcının ağ sekmesine bakın: başarısız `OPTIONS` CORS'tur, başarısız bağlantı adrestir. |
| Model sonsuza kadar `queued` | Worker çalışmıyor ya da veritabanını göremiyor. Veri kaybı yok. |
| Worker başlamıyor | OpenCascade yüklenemiyorsa bilerek başlamayı reddeder. Günlüğün ilk satırı sebebi yazar. |
| Girişten sonra tekrar giriş sayfası | `AUTH_SECRET` boş, ya da yük dengeleyici arkasındaki örnekler arasında farklı. |
| Yeniden başlatınca herkes çıkmış | `AUTH_SECRET` her seferinde yeniden üretiliyor; sabit olmalı. |
| Şifre sıfırlama e-postası gelmiyor | `MAIL_API_KEY` boşken beklenen davranış: mesaj gönderilmez, web günlüğüne yazılır. |

### Bilinen sınırlar

E-posta HTTPS üzerinden bir sağlayıcı ister; iç SMTP sunucusu henüz
desteklenmiyor. `MAIL_API_KEY` boş bırakılabilir — şifre sıfırlama ve adres
doğrulama dışında her şey çalışır. GitHub ile giriş internet erişimi ister;
kapalı ağda kapatın, e-posta ve şifreyle giriş çalışır.

### Denenmemiş olanlar

Her iki imaj da derlendi ve çalıştırıldı — arm64 Mac üzerinde Colima ile,
gerçek bir Postgres ve gerçek bir S3 kovasına karşı: `docker compose build`,
`preflight`, `migrate`, `docker compose up -d`, dışarıdan `/api/health` ve
viewer, ve kuyruğa konan gerçek bir STEP dosyasının worker tarafından
dönüştürülmesi (7428 üçgen, ~4 saniye). İmajlar: web 457 MB, converter 2,0 GB
(OpenCascade).

**Denenmeyenler:** `systemctl start` (bu makinede systemd yok, birim dosyaları
kurulum adımlarından yazıldı), MinIO ya da Supabase dışı bir depolama, ve
x86-64 mimarisi (imajlar arm64'te derlendi).

Güvenilecek şey `preflight` çıktısıdır: sizin gerçek veritabanınızı ve gerçek
kovanızı sınar.
