# Avis prioritaires et dates de référence

Les dates GitHub ci-dessous sont celles de publication et modification de la fiche globale retournée par son API. La publication initiale par le mainteneur peut être antérieure. Les événements OSV indiquent les bornes de versions, sans garantir que la fonction vulnérable soit utilisée par SAMI.

| Avis / CVE | Publication fiche | Mise à jour | Paquet / intervalle affecté | Première correction |
| --- | --- | --- | --- | --- |
| [GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) / CVE-2026-19484 | 2026-10-02T23:16:17Z | 2026-10-02T23:17:29Z | @fastify/busboy >= 3.1.0, < 3.2.1 | 3.2.1 |
| [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) / CVE-2026-19481 | 2026-10-02T23:16:36Z | 2026-10-02T23:17:27Z | @fastify/busboy >= 1.0.0, < 3.2.1 | 3.2.1 |
| [GHSA-gxm5-99cw-xjw9](https://github.com/advisories/GHSA-gxm5-99cw-xjw9) / CVE-2026-74866 | 2026-10-05T22:33:44Z | 2026-10-05T22:33:45Z | @fastify/busboy < 3.2.2 | 3.2.2 |
| [GHSA-jx2c-rxcm-jvmq](https://github.com/advisories/GHSA-jx2c-rxcm-jvmq) / CVE-2026-25223 | 2026-02-02T22:23:29Z | 2026-02-04T17:46:03Z | fastify < 5.7.2 | 5.7.2 |
| [GHSA-247c-9743-5963](https://github.com/advisories/GHSA-247c-9743-5963) / CVE-2026-33806 | 2026-04-15T19:24:41Z | 2026-04-24T20:42:06Z | fastify >= 5.3.2, <= 5.8.4 | 5.8.5 |
| [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7) / CVE-2026-76169 | 2026-09-30T23:45:34Z | 2026-09-30T23:45:35Z | fastify >= 4.0.0, < 5.12.2 | 5.12.2 |
| [GHSA-83w8-p2f5-377r](https://github.com/advisories/GHSA-83w8-p2f5-377r) / CVE-2026-15074 | 2026-07-24T16:43:21Z | 2026-07-24T16:43:21Z | @fastify/static <= 10.1.0 | 10.1.1 |
| [GHSA-8pvw-jcv7-9cmj](https://github.com/advisories/GHSA-8pvw-jcv7-9cmj) / CVE-2026-7120 | 2026-07-24T16:43:44Z | 2026-07-24T16:43:46Z | @fastify/static <= 10.1.1 | 10.1.2 |

## Python : signaux à qualifier par chemin de code

Les exigences de SAMI limitent actuellement Transformers à `<5` et setuptools à `<81` ; plusieurs corrections dépassent ces bornes. Leur migration nécessite de vérifier les modèles, PyTorch, CUDA et les workers. Aucune montée majeure automatique n’est proposée.

### [GHSA-vgrw-7cvw-pwgx](https://osv.dev/vulnerability/GHSA-vgrw-7cvw-pwgx)

Alias : BIT-pytorch-2025-2999, CVE-2025-2999, PYSEC-2025-193. Publication : 2025-03-31T15:30:48Z. Mise à jour : 2026-06-10T17:41:15.774477397Z.

PyTorch is vulnerable to memory corruption through its unpack_sequence function

- torch : événements de versions `[{"introduced": "0"}, {"fixed": "2.9.1"}]`.
- CVSS_V3 : `CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L` (vecteur de la source ; aucun score numérique ajouté).
- CVSS_V4 : `CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:L/VI:L/VA:L/SC:N/SI:N/SA:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-29pf-2h5f-8g72](https://osv.dev/vulnerability/GHSA-29pf-2h5f-8g72)

Alias : CVE-2026-4372, PYSEC-2026-2289. Publication : 2026-05-26T13:30:33Z. Mise à jour : 2026-09-10T03:50:45.254378086Z.

HuggingFace transformers vulnerable to remote code execution

- transformers : événements de versions `[{"introduced": "0"}, {"fixed": "5.3.0"}]`.
- CVSS_V3 : `CVSS:3.0/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-69w3-r845-3855](https://osv.dev/vulnerability/GHSA-69w3-r845-3855)

Alias : CVE-2026-1839, PYSEC-2026-2288. Publication : 2026-04-07T06:30:28Z. Mise à jour : 2026-09-10T03:50:43.300048881Z.

HuggingFace Transformers allows for arbitrary code execution in the `Trainer` class

- transformers : événements de versions `[{"introduced": "0"}, {"fixed": "5.0.0rc3"}]`.
- CVSS_V3 : `CVSS:3.0/AV:L/AC:H/PR:N/UI:R/S:U/C:H/I:L/A:H` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-fgcw-684q-jj6r](https://osv.dev/vulnerability/GHSA-fgcw-684q-jj6r)

Alias : CVE-2026-5241, PYSEC-2026-2290. Publication : 2026-06-03T15:30:43Z. Mise à jour : 2026-09-10T03:50:49.345942449Z.

huggingface/transformers: Arbitrary Code Execution During Model Initialization in the LightGlue Model Loading Path

- transformers : événements de versions `[{"introduced": "0"}, {"fixed": "5.5.0"}]`.
- CVSS_V3 : `CVSS:3.0/AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-x9r9-c232-4q39](https://osv.dev/vulnerability/GHSA-x9r9-c232-4q39)

Alias : CVE-2026-80047, PYSEC-2026-4174. Publication : 2026-09-01T15:31:13Z. Mise à jour : 2026-10-01T17:55:55.397425521Z.

Hugging Face Transformers downloads custom generation code before trust consent

- transformers : événements de versions `[{"introduced": "4.49.0"}, {"last_affected": "5.8.1"}]`.
- CVSS_V3 : `CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-xrqw-3rrv-vx5w](https://osv.dev/vulnerability/GHSA-xrqw-3rrv-vx5w)

Alias : CVE-2026-9856, PYSEC-2026-3929. Publication : 2026-08-02T18:30:20Z. Mise à jour : 2026-09-10T12:25:36.528730268Z.

Transformers save_pretrained path traversal allows arbitrary file writes through chat template names

- transformers : événements de versions `[{"introduced": "0"}, {"fixed": "5.10.0"}]`.
- CVSS_V3 : `CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:L` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-h35f-9h28-mq5c](https://osv.dev/vulnerability/GHSA-h35f-9h28-mq5c)

Alias : BIT-setuptools-2026-59890, CVE-2026-59890, PYSEC-2026-3447. Publication : 2026-07-21T19:09:21Z. Mise à jour : 2026-09-10T03:50:52.323347787Z.

setuptools: MANIFEST.in exclusion bypass in sdist via Unicode normalization collision (NFC/NFD) on macOS APFS/HFS+

- setuptools : événements de versions `[{"introduced": "0"}, {"fixed": "83.0.0"}]`.
- CVSS_V3 : `CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:L/A:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-xmj3-9gf7-h52w](https://osv.dev/vulnerability/GHSA-xmj3-9gf7-h52w)

Alias : aucun CVE publié dans la fiche consultée. Publication : 2026-10-23T21:44:11Z. Mise à jour : 2026-10-23T22:00:03.739009766Z.

setuptools: Windows path escape via namespace_packages.txt during legacy wheel installation  Description

- setuptools : événements de versions `[{"introduced": "38.2.2"}, {"fixed": "84.1.0"}]`.
- CVSS_V4 : `CVSS:4.0/AV:L/AC:H/AT:P/PR:L/UI:A/VC:N/VI:L/VA:L/SC:N/SI:N/SA:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-gc5v-m9x4-r6x2](https://osv.dev/vulnerability/GHSA-gc5v-m9x4-r6x2)

Alias : CVE-2026-25645, PYSEC-2026-2275. Publication : 2026-03-25T16:56:28Z. Mise à jour : 2026-09-10T03:50:39.207922076Z.

Requests has Insecure Temp File Reuse in its extract_zipped_paths() utility function

- requests : événements de versions `[{"introduced": "0"}, {"fixed": "2.33.0"}]`.
- CVSS_V3 : `CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:U/C:N/I:H/A:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-vxq7-64xx-v4gw](https://osv.dev/vulnerability/GHSA-vxq7-64xx-v4gw)

Alias : CVE-2026-97689, PYSEC-2026-4177. Publication : 2026-09-30T14:46:18Z. Mise à jour : 2026-10-01T17:55:57.514829071Z.

urllib3: HTTPResponse.stream()/read_chunked() buffers an unbounded chunk-size line into memory

- urllib3 : événements de versions `[{"introduced": "1.10.3"}, {"fixed": "2.8.0"}]`.
- CVSS_V4 : `CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:H` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-8988-9cw3-xx77](https://osv.dev/vulnerability/GHSA-8988-9cw3-xx77)

Alias : CVE-2026-97687, PYSEC-2026-4175. Publication : 2026-09-30T14:46:04Z. Mise à jour : 2026-10-01T17:55:53.793608550Z.

urllib3: HTTPS proxy TLS configuration may be ignored or overridden

- urllib3 : événements de versions `[{"introduced": "1.26.0"}, {"fixed": "2.8.0"}]`.
- CVSS_V4 : `CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:P/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` (vecteur de la source ; aucun score numérique ajouté).

### [GHSA-gh4c-6fx4-qh6g](https://osv.dev/vulnerability/GHSA-gh4c-6fx4-qh6g)

Alias : CVE-2026-97688, PYSEC-2026-4176. Publication : 2026-09-30T15:00:38Z. Mise à jour : 2026-10-01T17:55:40.608255720Z.

urllib3: Chunked Deflate streaming can enter an infinite loop

- urllib3 : événements de versions `[{"introduced": "2.6.2"}, {"fixed": "2.8.0"}]`.
- CVSS_V4 : `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N` (vecteur de la source ; aucun score numérique ajouté).

