import { createHash } from "node:crypto";

/** Every version of every repo-written Coaches Corner lesson's content that has ever shipped,
 * by sha256 of the content string. The lesson re-sync (server/seed-coaches-corner-lessons.ts)
 * overwrites a stored lesson ONLY when its content hashes to one of these -- that is, when it is
 * still a version Forge wrote and no admin has edited it. A lesson an admin changed from the
 * builder hashes to nothing here and is left alone, which is the whole point: tracks are
 * admin-editable and a blanket re-sync would revert an admin's own edit on every deploy (the
 * same reason CORRECTED_EXERCISE_INSTRUCTIONS in seed.ts is keyed on the exact old text).
 *
 * APPEND, NEVER REMOVE. When a lesson's text changes in the repo, the OLD hash has to stay (it
 * is what lets the deployed row be recognised as ours) and the NEW hash is added (so the next
 * correction can recognise this one). `npx tsx scripts/record-shipped-lesson-hashes.ts`
 * appends whatever is missing; `shipped-lesson-hashes.test.ts` fails until it has been run.
 *
 * The first 96 are the content as it stood at 00ce07df (2026-10-08), before the proofread. */
export const SHIPPED_LESSON_CONTENT_HASHES: ReadonlySet<string> = new Set([
  "314dc8393297dfb9f4abf493ac8ecfcafa5e37dd19e4fc5003a302f2cc1b9a4f", // Strength & Conditioning Fundamentals / 1
  "c8ca7cb001c3ac4290e51a354b1ed3eeb565d1dae04d46d0ac5c592b4d5e689f", // Strength & Conditioning Fundamentals / 2
  "1064052680779ebc93fc1ec12bfbed98ac7a820a8d751088ca807fe1506b9701", // Strength & Conditioning Fundamentals / 3
  "3931800f04bbf2b66493d18bcd2ea7c5458c60f41460e198e83f4bf5c4830a1a", // Strength & Conditioning Fundamentals / 4
  "84b88d17493539ab263ddcca0e10c8dfb2e0ca1467a5955ce2cdd9e2daae30aa", // Olympic Lift Technique & Progressions / 1
  "ed46e1dfef8f435afcb1cd2bc4a1cf22b07412c2ed77789f3b37a2a449f71f7d", // Olympic Lift Technique & Progressions / 2
  "37fa324a30f30421de1cefdd2478488217c8d6b3740c0165b2f5cb8f436c2953", // Olympic Lift Technique & Progressions / 3
  "392b587c8bcfd6e8381bb23c87e2afc13c2474dad4243b95fdc2a0070a18038f", // Olympic Lift Technique & Progressions / 4
  "b2d601ee59b0b2560beb62edfab5202dfa2e69b55c1697c92d2226c5fcdb5e3a", // Youth Long-Term Athletic Development (LTAD) / 1
  "0ed9ad7a316b909d5e3c2fcad5888b4342118bf5b9ed84164c92a761b46074e7", // Youth Long-Term Athletic Development (LTAD) / 2
  "79ed664b9a35cea6cd102560b97999779f9e5cd5c32b69b7efa3eec73c3d8dc1", // Youth Long-Term Athletic Development (LTAD) / 3
  "c1689f3f4a3bfeecde9e7f91ca6d4a44e16d462c6badb19315674edba3899672", // Youth Long-Term Athletic Development (LTAD) / 4
  "b69187ceb8eb7de9f989fd2c5f807b733107b18edd8b01d54045b83c3d382d11", // Sport-Specific Arm Care & Pitching Development / 1
  "077f18ab8a6a5d515b4e080fb1941d86e1ffde03fe204fe5db678d9c7eff40ce", // Sport-Specific Arm Care & Pitching Development / 2
  "c466a36cc04b0663db0af65fa9dd411e8fc962d735c3989f38b13d459fd0976e", // Sport-Specific Arm Care & Pitching Development / 3
  "52742feb72c6f8474aeeda1e615d6994ad920d2dd627dfdf5f025571b7acd9ff", // Sport-Specific Arm Care & Pitching Development / 4
  "af1af7c639026eb68cb0a6b27012dafbae50b6621f72d421ac9898a7a50ea069", // Reading Forge's Own Analytics / 1
  "640c68177197762a7e735d2fc54847deb7a1301153235cc972ba154b588df08d", // Reading Forge's Own Analytics / 2
  "7256518aea4665f96099bc964b68ab175225984b4b364f8a91cef485dae3a4d4", // Reading Forge's Own Analytics / 3
  "56f4cf786947b73a5995741911d25d5ef794b76df18c3042b2fd7ac51a898108", // Reading Forge's Own Analytics / 4
  "cb3e1ce5ae0f857923957c33b7f0421ac70448b7f23a71e749ffe5ece522718a", // Season & Practice Planning / 1
  "eebd9ec215c1264a77190ab54283f2a213946ac3f09ed0417e74fba2e454e1b0", // Season & Practice Planning / 2
  "f45bc20bfdf6ca7b62ad76308617329198ce2adcc2bd25c54ece9e8921c118c3", // Season & Practice Planning / 3
  "2efe67c38287d950a5ff5040ab48335ea863a04b8b08cca884ab280ef9601fa5", // Season & Practice Planning / 4
  "f7e01cfa8306202ab7a3c1e2cf27f497f905247eef981e6e572d1171f0fce718", // Coaching Communication & Culture / 1
  "96ee8555f32196e9305cc1b3f474e92a821747126df1af4fd36a7db453ce916e", // Coaching Communication & Culture / 2
  "05652f6b0814b28e377570468e1b9f1547a3f91fec39a41d7f69a6cd91a67930", // Coaching Communication & Culture / 3
  "1b9d902c816fb75c0fa0b4b6f145019972e8b88a0ccdb5550cb3bef29b8fc25a", // Coaching Communication & Culture / 4
  "b32197e120fb6858886e2aecd4a60d0f2a529fccf172e359965167994520fd9c", // Energy Systems & Conditioning Design / 1
  "2f426734d43ea6f5c9c91018396a17f947b25e7530f0d523f37e28c0da65d5b0", // Energy Systems & Conditioning Design / 2
  "658efab94bc33773cba6d927c3eca28e3cd8a486c5df3bec25c8a29ddf503a6a", // Energy Systems & Conditioning Design / 3
  "4bb3bfcca5d2a71423c2b1942d2af17fb4b7f4e0959a582143a8a3b16d21e949", // Energy Systems & Conditioning Design / 4
  "86038fbaf8e9992475c60cd29a26d541f218941fc467e21d0aefbfb59c633392", // Speed & Agility Development / 1
  "96996ae3f035ecf40a630b213fa36ff6e22bd71b8197f54df1dec8f26c564da4", // Speed & Agility Development / 2
  "276046a1f6606b8a00cbc8d49a99e9075f98aaa391d4d230c61242632cb35d82", // Speed & Agility Development / 3
  "969d4be483d4b56e3d9c281caf6b93c6f2d3ea795fc5f88c42e2cdb5e5728975", // Speed & Agility Development / 4
  "7c8aa8a87c420e4bf8c1dd945b5663dd830624f4cb4b33a0b942775fda60700f", // Plyometrics & Power Development / 1
  "d5eec23da0d58b8bd0ba1d55a7c12743aa9eb7b222aad63e5474d23cdebf5601", // Plyometrics & Power Development / 2
  "04b859bc680982ed4245474fda902ab2bab2f5775f00c5a45f17340a3eec8f00", // Plyometrics & Power Development / 3
  "81c5917f1c46f85dd3777819a556e8247ebb7185bdc6c796afe4eea43b12077a", // Plyometrics & Power Development / 4
  "580d68a5bb88ccdd34b44bc1d772052cab7930f4c37aaf1bd41dbb767101068c", // Warm-Up, Mobility & Recovery / 1
  "6fc9f4121b1f25e9e7e805a0801aedb5d49e90e09e753c664632f3bb8ae1c5f0", // Warm-Up, Mobility & Recovery / 2
  "4415b1e357e9596559c207ccf671db67074e60a62af7ebefbada440ecc4418ec", // Warm-Up, Mobility & Recovery / 3
  "a77bb9274b92e350084e746c08a9ac4d8ea067c9167e5d1b972ef245b0097a3f", // Warm-Up, Mobility & Recovery / 4
  "38472014e7aca0b4c63eefe111fc3310a450943cf3a46d042080b6d03a3385d2", // Testing & Evaluation That Means Something / 1
  "ab983d3666fe2d2045efc3da4f24f28c524463430a2507e2d3a8adff5bf601d1", // Testing & Evaluation That Means Something / 2
  "be91c6dd6bbbef4890ab945afb319b32926c7e53b5990c081d7121fc6318e25e", // Testing & Evaluation That Means Something / 3
  "72cea94ee429c4817dc250ac85fcf46105379204b6766602ebdd6b1a38c1f382", // Testing & Evaluation That Means Something / 4
  "2ea47273f1bc2c7abbc81a3bfd53be39938ba48b2727e734f734a488f2d0016e", // Lifting Technique, Spotting & Weight Room Safety / 1
  "e6a6d0dc154dd2ea9f0bbcfcf43dc916ef406edbc91ef839255e12adc2eb9a93", // Lifting Technique, Spotting & Weight Room Safety / 2
  "95599e41f613f130eeaf76f180c4900f42329c1942e96004d8b068e34ba09c40", // Lifting Technique, Spotting & Weight Room Safety / 3
  "83399ee1893f9bf9c1671aced8eeb0b762e0cf79a3d9ba577bf4ade573d545cf", // Lifting Technique, Spotting & Weight Room Safety / 4
  "d894d887fb84c87221cc6d247321efe6b9e1499b6a77c72b169b9dc91e89c835", // How Muscle Produces Force / 1
  "5385b0df8bf85436c397d81b7b944471e6e996037537f5dec17d90babb185572", // How Muscle Produces Force / 2
  "1b4680bedf4016bdb8d2cc7e36b3fb96fb578b83f088bc01fbeeee1ec18b05a0", // How Muscle Produces Force / 3
  "b781f9172082b9a266a85ebf5cc1070d039197fdde6e107ad3b6786304f0c27f", // How Muscle Produces Force / 4
  "2bd29163378a22796e9fb5e0d2db033c73b6e89d3a6c313f795462c0659fb37f", // Biomechanics for the Weight Room / 1
  "a6668523a9cf7b0f2767426de0573e5504cec19105498efb49762bfc9a8b5018", // Biomechanics for the Weight Room / 2
  "e312dcf59c6a39aa4ee280f9d329c4c4ff7a5bfbb4c736d85b880ff82e7bc571", // Biomechanics for the Weight Room / 3
  "63244ab5dc4bf9f629d4b3f1b4849a550467834486ae2df4bb56f0736593127e", // Biomechanics for the Weight Room / 4
  "0522dc450baec6bf79e091ea43ed8f68aa86aba0e4e8c2e4ef34a1b8d1f34524", // How the Body Adapts to Training / 1
  "2dffa9f2caa810a30f0a597be2e6b0457b652cf6e9902c7227b415390ff53129", // How the Body Adapts to Training / 2
  "cd5bb933569e6db450279a272260c8af85b9d8313153784fcd5e88639a2563ec", // How the Body Adapts to Training / 3
  "e0646daf4222988fae90d3ff1f9a68f19489d4522e6d7fe51e948270f2f27d86", // How the Body Adapts to Training / 4
  "66662de889f2316568fa5017fa0cdc033f08cd6bffc7fdd65656202c4d0f076a", // Hormones, Sleep and Stress / 1
  "61bbfd8d7459fd9b97747597838747abf9368c34000da8e9615d6bc9546f695b", // Hormones, Sleep and Stress / 2
  "06cfd0f95491140f17b788065bc3077cf03e2c96e781bc11e1b572f4a9257f2c", // Hormones, Sleep and Stress / 3
  "fd52f1355ff33ff64e3ed12dbce252362cd124b6be4e74f9fe641582a92ff4ae", // Hormones, Sleep and Stress / 4
  "7553d3c32d3c91b0058235e6eb056c8150d6322d10f1fad7855b10e2686de83b", // Fueling the Athlete / 1
  "2c76c6fa72fd2a7015f310658c580149e2a6a3736197d5999c599ec522e1cad9", // Fueling the Athlete / 2
  "3554a1623ebf7a0566f7f24109e0b545ef1b5d7cf88c725113e14b5b064a5b6a", // Fueling the Athlete / 3
  "99222156b1ec0a74a8efe7502a8cc18f8157703fbf2d6bf4e6cccfb48a853133", // Fueling the Athlete / 4
  "cea455853a8912d7964e09ecb04dc3311b0207baabe75cdcca8cab6f4d6515cd", // Supplements, Substances and the Coach's Line / 1
  "43b648d770c177826c34511a6662b0cf93638d91662e6de2e708432466a4acbc", // Supplements, Substances and the Coach's Line / 2
  "c4ca9c2fd31bc72fbce51bb7a819683b288c0dcb3a48939bad878864178b96f4", // Supplements, Substances and the Coach's Line / 3
  "b04655564216bca2264ffe778e62c06ee350e63d1ba4910bb4777bc5bbd34c6b", // Supplements, Substances and the Coach's Line / 4
  "66d960e6309a6533f9b3421e869d3c72bb99560365884839c0736d024ec78c6c", // Writing a Resistance Program / 1
  "8eba31def572687b3f2e18f70e4fdb7a2ceee1dfa2d369d19cbe6cf4c3ab94c8", // Writing a Resistance Program / 2
  "1c13f3485d3ef071499be8230cf6f2b9638ddc373e754b3cf935b2504046161d", // Writing a Resistance Program / 3
  "0b9fb0f3af45cc1e5675bd265b8e3b4e4f05175a61f111e4454a662cb9b67c9f", // Writing a Resistance Program / 4
  "0d536464737c805b64918b0476d248c5c0b8a0f7e54f24fe1387d31f33d1ff9c", // Aerobic Endurance Programming / 1
  "c457e0619e46b0d4c47ee1f2ac2a108c40b02bee684103b605b0f0000ec16b2b", // Aerobic Endurance Programming / 2
  "535122efa65ce12d3cbf436d839d0f9ea8f4208a90e602cfb1f5c9daedad6a72", // Aerobic Endurance Programming / 3
  "03517ec090374199f5bef1e22b2b742d7b7bf683d9c9fcf75d12a4f5885ec192", // Aerobic Endurance Programming / 4
  "ceee51fdde6a97ef677f41bd5371211f990a90ce763aca08d20c864b77ac59a8", // The Mind in Performance / 1
  "875fa85d4a87ba46434f9916062ebd2adbde9faa470b2878a6eb68f8f801475d", // The Mind in Performance / 2
  "27cc4fa9cf8e7605109f6c8ab608894e94e61cece8f1f7d1c32f3ce964eab7f4", // The Mind in Performance / 3
  "773ea4a9885c94f969879dd4ada572660cfa1f8d9a09511d85b842039ce4d403", // The Mind in Performance / 4
  "3860ea48c178397255ff9f18ae3a8c8bdf3aa1665ccb7ab7b2823413ffb0202b", // Training Women, Older Athletes and Athletes Coming Back / 1
  "59c78632137fac4b0adca7faf68155c7d0ba471b04a6b3f627294fa396443cef", // Training Women, Older Athletes and Athletes Coming Back / 2
  "0c602054879b569140e6a8ab565e92ad2c78d63991ab491f2cad1e02c579857a", // Training Women, Older Athletes and Athletes Coming Back / 3
  "c817a8961cb0c20b34557014cd898726771054333b0843d6916af5745ee33642", // Training Women, Older Athletes and Athletes Coming Back / 4
  "9db0d3dc922b5cd0b7850f6a304b3f8307db96fbbc010a83540336c669cdb89f", // The Weight Room as a Facility / 1
  "7e2b27ebc48c1908e3b5c4bab24f86e5e3e6cd4416e9eafe134402d58f2e1c4b", // The Weight Room as a Facility / 2
  "81f0cd635420850827ae49ab44c869df555e66b6bb5acafd9ca44ac813b540ca", // The Weight Room as a Facility / 3
  "ca1bfb1db74903641265ee86089ba7070008cbdf5bd43d02479a9ef17c1d4754", // The Weight Room as a Facility / 4
  "e964428fbb71617000ba8e201879e776aedc9e4c5fdcca6399625b330380f8af", // Strength & Conditioning Fundamentals / 1 (2026-10-08)
  "ad9f36170626768ac1eb6f29757b336c40efe700a1a1f8b2c51e9e0b1a934068", // Strength & Conditioning Fundamentals / 2 (2026-10-08)
  "551823f3d123d3bd2d97c317cb5e29cd9f42abb939bc8eb370d27f2d222bed16", // Strength & Conditioning Fundamentals / 4 (2026-10-08)
  "b34354b3bbf61d6858b4899466ccb9a16cb9f28ba1507721f66db9063f97c0f2", // Youth Long-Term Athletic Development (LTAD) / 4 (2026-10-08)
  "98819dd3d5cfcde1c70fc0cf100cfb8c554002b448e34394349c7c732c085982", // Reading Forge's Own Analytics / 4 (2026-10-08)
  "15f288d64bebe6d89fd06e8af065f03e3c4d3e31e8b20317f728f86fde5a8398", // Season & Practice Planning / 4 (2026-10-08)
  "c9bf03042113fca35f44281481a768611bc1bf23a5b4db40ba1f2fcbc1c1e953", // Energy Systems & Conditioning Design / 2 (2026-10-08)
  "55a36e964d1fcb9c13fb3b0685577ad8b6a9601b2d7f8963d6387ab8b020965a", // Speed & Agility Development / 1 (2026-10-08)
  "0e3dbfd66462db5184ad87c19426dc9d597b1017d0069805b55b7c8f8ccd9d01", // Speed & Agility Development / 3 (2026-10-08)
  "93c021b301269eeb2c1984a11de820290d8a6345cf289a3aea148e9eb8982ca2", // Plyometrics & Power Development / 3 (2026-10-08)
  "230460569936f22b7e716a1636204f79c3b1f634291d4decfbf8f927b1edd2e1", // Warm-Up, Mobility & Recovery / 3 (2026-10-08)
  "a23da098d42b7719171a869be52d19d77c74e0a3922857a00d5daec3004db94e", // Testing & Evaluation That Means Something / 2 (2026-10-08)
  "97e2abe15cc0f2afc6c6e5f8b93988e3dc3f3def5a512aa504aec9ed6b7b375a", // Testing & Evaluation That Means Something / 3 (2026-10-08)
  "3725c86e1b43f616d1dac5ec2fae3a7dccd4a2a009bbd76b88e072e823bca949", // Testing & Evaluation That Means Something / 4 (2026-10-08)
  "34add6e9376ebadbd503a1e70db06aab1104bdfd44dd4424a486d47debf3129c", // Lifting Technique, Spotting & Weight Room Safety / 2 (2026-10-08)
  "dc21020ef67ed5f26d6b3f3669dfced085047a18acbd653189efca8bed7226ce", // Lifting Technique, Spotting & Weight Room Safety / 3 (2026-10-08)
  "5569d23ca8a18589d77eb8602af8c74ba0931ddf9347cfd905a7e496bc726bb5", // Lifting Technique, Spotting & Weight Room Safety / 4 (2026-10-08)
  "d490a4ea98755332fa0d57d0784d881f4e7d5e03de8846874a3c6fdfee838624", // How Muscle Produces Force / 1 (2026-10-08)
  "ce1dda63e065063e66d2e42c423eb4a5dcc954a5b6835ed9db84f1b04f83db8a", // How Muscle Produces Force / 2 (2026-10-08)
  "badd03c863b40489fcfebca485bac4b9bf09cf554e5d9603172d150b40e3bb24", // How Muscle Produces Force / 3 (2026-10-08)
  "e261f6f34b969bf7f4e4b7c20fdd485311a4f0cd9aad08a296408273018bb790", // Biomechanics for the Weight Room / 1 (2026-10-08)
  "17a2559edc190a1bd5f68cf80e657d606758d355446e287936eeafaa3ebfb007", // Biomechanics for the Weight Room / 4 (2026-10-08)
  "778b864a1e24540005907d37a4ddc5b8634a043acef8efe4ce6f2959f1c5ab8f", // How the Body Adapts to Training / 2 (2026-10-08)
  "35048f2d5abee1c387c108662829fd4a187507c38a14230d20340f73afef8312", // How the Body Adapts to Training / 4 (2026-10-08)
  "2a2fe63d1870b8993fbe29d847d53c62639547c75eef81564b01538e9728a9d4", // Hormones, Sleep and Stress / 1 (2026-10-08)
  "3846f04df3aba0214816afc7fcc8cd36c2e1833fbcb9aeebfc266e8035f857cb", // Hormones, Sleep and Stress / 2 (2026-10-08)
  "32ecb4bc4e3906c2f9f2ea8235cd9038be30ad8f92ebba4b4cea92a5784074f1", // Hormones, Sleep and Stress / 3 (2026-10-08)
  "f20c5536fa628b79465f9827e7ab9fffd7d4e47d7b13252fe31c9f9789b19b19", // Hormones, Sleep and Stress / 4 (2026-10-08)
  "d504855ef54f023cdcde317ce5f42d4580104732e8d749144f240c25337d5a89", // Fueling the Athlete / 1 (2026-10-08)
  "f8cdb869209c4a792612a2aa480492b83d82a7fb430b76ca697490fe5af0f9eb", // Fueling the Athlete / 2 (2026-10-08)
  "96014921d41439fd53991ade1aa4c5d9896a51627187c1ad9dab84627e191cdb", // Supplements, Substances and the Coach's Line / 3 (2026-10-08)
  "c2b3cede47fa9047dacf6057b6f647ff68d93c32cf92c72fd899887c5c78f90c", // Writing a Resistance Program / 4 (2026-10-08)
  "677068f560678446ae5065af04e93708a7db9e8efd0393d00a6ba74144fec804", // Aerobic Endurance Programming / 1 (2026-10-08)
  "9a287711fe5b9a092df1119045556c721e81114392752ca1b26445c1e55d6724", // Aerobic Endurance Programming / 4 (2026-10-08)
  "05fd92a14bace193659db18577396a62efddda40ce4ff804910804746da3f379", // The Mind in Performance / 1 (2026-10-08)
  "44c8d7f4ebbd0e042e5053d2a51ef9c373dbcd503e1cf50a0ab3e2dc3330908e", // The Mind in Performance / 2 (2026-10-08)
  "0214fbc7078251ba4689a4535bf57d5abf283bc58a0a664929769cd8f8a7b5d3", // The Mind in Performance / 4 (2026-10-08)
  "f4b3e994117ff1a0eebf04b9fd0bc9248bf881462be7cdf63dba134094067786", // Training Women, Older Athletes and Athletes Coming Back / 1 (2026-10-08)
  "ad88dc9dc91736422044da87215bbf8f401e52f36a190fb4390a7479cb7a1c36", // Training Women, Older Athletes and Athletes Coming Back / 3 (2026-10-08)
  "351c25ad9862c1b97a8bd3b1851d389889013dd5a02a39538a2dec89ad2b3964", // The Weight Room as a Facility / 1 (2026-10-08)
  "0b2961ccdcc66de88947ab4a67fad600fed44dc4c932052071163209dd7e6355", // The Weight Room as a Facility / 2 (2026-10-08)
  "a514a5fdd176915e8b118091670e257e3399112cf4b395b866eed2502058eff9", // The Weight Room as a Facility / 3 (2026-10-08)
]);

export function lessonContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The same ratchet for a quiz question: its text, type, payload and answers (text, key,
 * explanation, in order), so a corrected explanation or a corrected key can reach a deployed
 * track while a question an admin rewrote is left alone. Same APPEND-ONLY rule as above; the
 * first 157 are the questions as they stood at 00ce07df. */
export type HashableQuizQuestion = {
  questionText: string;
  questionType?: string;
  payload?: unknown;
  answers: Array<{ orderIndex: number; answerText: string; isCorrect: boolean; explanation: string }>;
};

export function quizQuestionHash(q: HashableQuizQuestion): string {
  const canon = JSON.stringify({
    t: q.questionText,
    ty: q.questionType ?? "multiple_choice",
    p: q.payload ?? null,
    a: [...q.answers].sort((x, y) => x.orderIndex - y.orderIndex).map((a) => [a.answerText, a.isCorrect, a.explanation]),
  });
  return createHash("sha256").update(canon).digest("hex");
}

export const SHIPPED_QUIZ_QUESTION_HASHES: ReadonlySet<string> = new Set([
  "0e576a1cdd6d8747bb44a723d4ee4e5226c12001a39ca2b16f8b9ccaaaa86990", // Strength & Conditioning Fundamentals / q0
  "cfd34c78a40f4bcea1fab4f792c0aa519780857a42aa4ca0309c0c50269ffc20", // Strength & Conditioning Fundamentals / q1
  "dd563a435750a80d2d419923e54bc385ff92753cf8474848ad7f40264579734e", // Strength & Conditioning Fundamentals / q2
  "6c4eac0862e9314f99848475aea29a1bf7edafcb0f24adcd70edb0c0be0c8a4e", // Olympic Lift Technique & Progressions / q0
  "89307e23cd98ae0ee67e304ec9b299bce642519448b0895943951c9a1da68fc9", // Olympic Lift Technique & Progressions / q1
  "b56e20e4d341391bf11e0a3c85e5fd74c1dd949572e2bfb1c4e10eb412d7c99d", // Olympic Lift Technique & Progressions / q2
  "18fd1e61ec3fbcbd2dbc9e00104361c74c26d0469667823cb31e9d7e9a0cbb9c", // Youth Long-Term Athletic Development (LTAD) / q0
  "e5f7b45e4b4284cfff223edfab590dbc29e6c0f5fe89533e4e58edaa717bd0ad", // Youth Long-Term Athletic Development (LTAD) / q1
  "b5a675f7a678a7d224bfe15debddb43a6b2a3a6b429f49183a7ef20667a0ae1e", // Youth Long-Term Athletic Development (LTAD) / q2
  "c340f2f4b25ab4c99751e610a356bdcec61dca8b68a7772866f22a787c74f415", // Sport-Specific Arm Care & Pitching Development / q0
  "2ebc9aff51bb7be709023cb40075f14201c114b6b842c2152e2838498be0302f", // Sport-Specific Arm Care & Pitching Development / q1
  "3b1d66fa0b633a791d297ce47d85a971934093e5758295d9f156afffdd3e9bf3", // Sport-Specific Arm Care & Pitching Development / q2
  "1542237df69a843c0eef3fd277009f563059dbfae1a8f2ede3a3679fb373ae25", // Reading Forge's Own Analytics / q0
  "3a61c27a75eaa934ecfc1c36d7b0b8c4bfe56ca0ba6dfdcc7748125202231916", // Reading Forge's Own Analytics / q1
  "3aa1cbe4aadd61706e2250fc35ea67b32c0595059bcf970a3de4d63f227232c6", // Reading Forge's Own Analytics / q2
  "5f8e6ed87f6cb2cc90cb9ff6153e265b407f74698bac6082eb4d9b72cc3c111e", // Season & Practice Planning / q0
  "52de16105b9877aeb474a059e7a18a1f218f6106983d38e45f407b2723382b6c", // Season & Practice Planning / q1
  "50e897226f51990994f8fba80bc58214f5c135311f123b7e2eb511cd91541004", // Season & Practice Planning / q2
  "bdefd952b35c7fb22288840cfd1e046f36ff31749305074b1ff122a0a99a01fd", // Coaching Communication & Culture / q0
  "7cd3cb12707551aebaad7fdeb8e049073eb53006f381916264dda71c82d7195e", // Coaching Communication & Culture / q1
  "9ae8fe8af77a70dcb0e0a52138c64cca74b78ed05e4d11c187696ae097b0aae7", // Coaching Communication & Culture / q2
  "81b3d18aa9f2139b54343a536e0e34c26215afa866e0c3b5f9c72179d6b72bdc", // Energy Systems & Conditioning Design / q0
  "9d0519ee4c5bb28f9c17fafa443646ef77b85661a05c1f69d49790d57ae8564f", // Energy Systems & Conditioning Design / q1
  "0dbfd4cf9f0c6c8b23f82a734178c9906d3a79fdbab05b8f486aa20228e65d77", // Energy Systems & Conditioning Design / q2
  "8eac03a0ab755f1a2aadc23f3375fa3ffafe8a39395aa16bacf85e495f9c60cf", // Energy Systems & Conditioning Design / q3
  "75e8f91787f8a1c231e437a856964c975d6c29cae6d4520c89e295e3ada3311e", // Energy Systems & Conditioning Design / q4
  "cf9061206d2f2c1f7c9a889482456c43fe7e708692fcb98b8135148d46a3d489", // Energy Systems & Conditioning Design / q5
  "ed2586f0d481ab4a9ce01960f9a5d149a703b528a45b0566c02f60b0a2f98ad0", // Energy Systems & Conditioning Design / q6
  "ee479e0c6baa1af189c4a4ee66edced969d1cbf1b61dfb71daeeed75b55dc334", // Energy Systems & Conditioning Design / q7
  "e73ec06a9d592ea2135672f58423130ad7321b5b2a974b8407f2f7089fbccb3c", // Speed & Agility Development / q0
  "f9378ccd014bc8d2cbe006c96715bcb485bb2ee05ec06a2de45404277fe91845", // Speed & Agility Development / q1
  "466c5869456e686dbdc6599a6dc6849ca258bc884c1464f37ebaecf10a4b0bae", // Speed & Agility Development / q2
  "76a75e3d356f5a2e7144b1ae2c88bd4e8f9f1d085da6550c2ba764d0a86f09a7", // Speed & Agility Development / q3
  "76f8e1c465c44bc90ee3582f23b29cbbb3608e74ea21dedf5169247cde3bac24", // Speed & Agility Development / q4
  "1a7d37df2c346c9658e31b5ec83504ca9279f5ba8c8de03c06679efb6ae71304", // Speed & Agility Development / q5
  "6df7a3b6076a7998ffb5587f2b3cd97c11e2f53a2fb8718d7536dc80384b340c", // Speed & Agility Development / q6
  "6f2e2d302484e82e8855fea46c623c0efdeaa54939c40188eb0ead5cbbe91f5d", // Speed & Agility Development / q7
  "4ed04ff5df3466cd93603fedef9b3241cf4e1a489aeff99f60151c774b470fdf", // Plyometrics & Power Development / q0
  "d50cee8241c2e1e367284dd3e8ef2f2870c8eb38df7d80ddeb92501e7501963c", // Plyometrics & Power Development / q1
  "e44d6658ad8c6e9128499190d58762d7ca0d73dde97b3c2b4d2183400f556a7c", // Plyometrics & Power Development / q2
  "f0d8f1dd1aa9f32817a414ac4a78b4b36fe345dd6d77e9fe15efd065d5de52ee", // Plyometrics & Power Development / q3
  "ff0a443e93db65120bb050f4d3a07d6a8237294465bad05844299cabb2c2f4df", // Plyometrics & Power Development / q4
  "7168a875c815be29addcaa718f89ddf513125e539fb042bc7e6fedd008774344", // Plyometrics & Power Development / q5
  "3b4a0922cf9b550c3f13d9d497b1780aea283948e67b8ec9974d9203eb14cc15", // Plyometrics & Power Development / q6
  "9a6c47a26747a3e4b3c8ba948287133103652eb1bb542aeccbdcfeae2d113e05", // Plyometrics & Power Development / q7
  "f96b7e564ee80568e3ec1fbde40c21504e7af42d828dde479bfc03d3b45b101e", // Warm-Up, Mobility & Recovery / q0
  "884995efe0aadb24608bc4eeddb17004b37934d4ec142a65e33e375d34c53784", // Warm-Up, Mobility & Recovery / q1
  "722db50ea0d5606597e6b9e5110f924cf97f43694b88e1d4292f9702b6207202", // Warm-Up, Mobility & Recovery / q2
  "fb6c0672ed58ab3c9dfc382056d0cd031729a58d69daf34c8035d01bcde6842a", // Warm-Up, Mobility & Recovery / q3
  "54f8a0f55c7f74dd5edaee8ee4fa130ff0799b4b9084f99226660c082bd98840", // Warm-Up, Mobility & Recovery / q4
  "0dd16f3fe99777846330f92fef61da9e27ca48570eae4d54b87bf8a95fc6bd52", // Warm-Up, Mobility & Recovery / q5
  "d92838314be1a4392a4ab3ad1452fa5a72ce3e3a4152421664f44d71c7b0c129", // Warm-Up, Mobility & Recovery / q6
  "19e8a00ed9ea7ef4c9d90b86af9634055ab283a5cb25618b0cc2af6587f6db2f", // Warm-Up, Mobility & Recovery / q7
  "e0bde57319f535d99f51b5e5512a033f0047efe26e294a376a834c3ceee6685f", // Testing & Evaluation That Means Something / q0
  "6ce038d32845cdd26c2830878027608bae22a9950b01a7016c03391443e0cca1", // Testing & Evaluation That Means Something / q1
  "00d297a52d0c68856deb8d264d22e5f71ec2ea1c41eb677519d1d208e52e7d54", // Testing & Evaluation That Means Something / q2
  "4d36f441f65f0d5e7b503d34b5eb5dfbb4c78f2ab619c89643249825c0417602", // Testing & Evaluation That Means Something / q3
  "335abf8c916aae858eaaa4fd5d92faa374ff4d0bfd9bcc3badd9f7c044126676", // Testing & Evaluation That Means Something / q4
  "1a31da431644ec69b373042adc91aa1e2845bf4d4ec43daa0a9382dff3566953", // Testing & Evaluation That Means Something / q5
  "f86d425d352e48d55be11a9ebf50a2636915ee2af6945df23f1c61121614798a", // Testing & Evaluation That Means Something / q6
  "0701b4fe6ca8645731f47cac3e03d5d8888c7f1a6fcea96ff020fc85df6e17af", // Testing & Evaluation That Means Something / q7
  "093c16b337a8980464f6d4009fbcbbd813b8e88b21a1079825ee1c4b266ec495", // Lifting Technique, Spotting & Weight Room Safety / q0
  "632950c4241e77e837a52951a875123434a1557fd4331724336570b989bfa8b2", // Lifting Technique, Spotting & Weight Room Safety / q1
  "025cbdc1435f2cc776427c94503346dd900deab9045bdf5aac11b34afd811385", // Lifting Technique, Spotting & Weight Room Safety / q2
  "2d61bc20fe8b7cceacdfe3be75173f648a8bc4815ce144676c089fbafddfca75", // Lifting Technique, Spotting & Weight Room Safety / q3
  "63b5e7ae220c601349da3b4e7ed35175040cb596c1c78af07da6e128ede4c7b7", // Lifting Technique, Spotting & Weight Room Safety / q4
  "47d599be3c40df8620e57901a2dbef86f1e1f6a07456d831f25e0d15d908f63b", // Lifting Technique, Spotting & Weight Room Safety / q5
  "ac0d38b3498d2ba1d16ee5db32d683ffe52387fe35779618fe300dc2543271e1", // Lifting Technique, Spotting & Weight Room Safety / q6
  "7ba810a8537bba787dfd289eba109412a35e0b6c80e023447eaffe5898b570da", // Lifting Technique, Spotting & Weight Room Safety / q7
  "341c73939f4eef38676152b8993aa1e00350d57f357df97c6e13c6edc6c1951d", // How Muscle Produces Force / q0
  "8900461fedd20a5ca253cd0ed081c5cc520654d5922d5f1908af284236c0f5da", // How Muscle Produces Force / q1
  "7fc33015d585f10253514d1fda5ec38115dd5043c3ebdea67dc6f2b85bb75aa5", // How Muscle Produces Force / q2
  "9ca54da4275c9bab931dab6f2dca88a2ebf60dfd14e8d9fd2bbeaf2a1f315718", // How Muscle Produces Force / q3
  "692b70c0c08a5d9a19b1e96efe4962a33e20f1b09e277be6ca70f977cad04d05", // How Muscle Produces Force / q4
  "1a09dde8b5acf0d75413a8018ecf59b0a567857cb256dfe011e3295f8fccbeb1", // How Muscle Produces Force / q5
  "ff4d100e183bf3420063bfb019db9ac5de2a222b06765425e4716e601e12c374", // How Muscle Produces Force / q6
  "fbe05d577e716e0952194d92433a60c9dcc80c2dab80aa7172e9a906cc8270c8", // How Muscle Produces Force / q7
  "82aecf8cf67c581bfb20864a07039e06ae316e29fa1d70d99b3ad78d636fb1a2", // Biomechanics for the Weight Room / q0
  "004c526b725ba2c0972de7313416809872b4b89605e8dc83873b033bbab52666", // Biomechanics for the Weight Room / q1
  "bfacdc72dcab9db5f52fdb817a0e2e47e79e5efc10c1973f98f724f0b3f855d5", // Biomechanics for the Weight Room / q2
  "fb88b6d41e9b608a1564b2ca9e3b404f75a16375ab2f4d10f5a60098af61132a", // Biomechanics for the Weight Room / q3
  "a075315bd8273cadee22e504272de7126c0fa67b4645bf26e005afd6c57c2eab", // Biomechanics for the Weight Room / q4
  "be4c8d67434f0eb953807d720b79a824b5fa0c74a7b4feb0402ce119ae3c1844", // Biomechanics for the Weight Room / q5
  "ea2d8b058ae7b469271c82ec05129317064432380c156337f820eabca5b4fc70", // Biomechanics for the Weight Room / q6
  "a9e06a7e3ceef9eb20f3e9390409b9e91bc74b0e7fefd18467b029ccbd024fdc", // Biomechanics for the Weight Room / q7
  "e5a49c124b5fb9dcf5154424e7a0e6dbc32acf022200bd1f0f41e76a9c6137c5", // How the Body Adapts to Training / q0
  "37f176634f2c2549d9355f8dbd830374d61b318acdb807ec5cbe2e38980cd3bd", // How the Body Adapts to Training / q1
  "707b2948a303f53267efaa40c3e1da3b2aa022919bb505d7ccd1cfae4ef7a9b0", // How the Body Adapts to Training / q2
  "d5b80bfdab5f13cd54ec431727005783fc4a03b79b1600805cb5f38b70044f22", // How the Body Adapts to Training / q3
  "af68fcb6da7a0be9495f58b782c00d95e39a70aff8bf0f4e2a8ce04a7846e299", // How the Body Adapts to Training / q4
  "b18b7e965779cf59fd337bb666d984b7d1406af52011ebb6f000e621a746af6b", // How the Body Adapts to Training / q5
  "9d044fb6b1ba0502e2e6ec3a2fb8b0dedee5458b58a54c1bf205de330edcd188", // How the Body Adapts to Training / q6
  "3761068e9539734815743d1a4cbb5629ae90796c1fcaf18bc2bae9cb0e098dac", // How the Body Adapts to Training / q7
  "77adecb94ddfde2cdc772994a73b17dff6a118a2145fe0fade86da6bb81a1457", // Hormones, Sleep and Stress / q0
  "b37e7e2b660a0a0cf0127bb4f3ac6576eb95cc5b901ee6fec4a3edeb4d8f0d3c", // Hormones, Sleep and Stress / q1
  "9c3d728f1925eec395bc988986f770c587a16a72ae0c75d255c1eee31e62b3f4", // Hormones, Sleep and Stress / q2
  "370f70be6c2d1a6728ea2602c7e0a939fea631f1c776e9b29ac819c9000304a3", // Hormones, Sleep and Stress / q3
  "175a367f99325e69527f946a0fd32c1395329daa1a1b6ca13e5a72c3cda46398", // Hormones, Sleep and Stress / q4
  "375fe3d11766bc78841523bc19a6013ded0dbfaa3c257f4d9deae459d2d2062f", // Hormones, Sleep and Stress / q5
  "0fd7cb1b62d10df405736160e60c5dc34612ee6e241c60d262fca0c7b396831a", // Hormones, Sleep and Stress / q6
  "63cfe092fa735c32fc1b19a4017a71b91f63f5f5470f0e004d02d5c6f3f45f1a", // Hormones, Sleep and Stress / q7
  "d1de6946c81316d853fafe9793b2ca5e6ebe5d8e548828086a1b63f54f614079", // Fueling the Athlete / q0
  "fa51c0867594c50e64237b224d4b286e67a3f4b110e062f92cb27878f0082aa5", // Fueling the Athlete / q1
  "ddc3d9df8c64e14f493199dcbeed31d069d6094970f9e252b32a902e44469a0c", // Fueling the Athlete / q2
  "4ecb9778d12a23ab2eee267e7586e629aae3d3b7bc5fa39572abacdcc072d230", // Fueling the Athlete / q3
  "cf6ae35355b40c4ac8dd086fc7f7d336b6004e61a9427781aadb7eb1ded86177", // Fueling the Athlete / q4
  "6f94c5a480e52d1578c0f3ea42f8b88ce9a1e7b843c47a9db910556e68245951", // Fueling the Athlete / q5
  "cfdba66d232b53fa8c69be787e84383b070838ce6dc6bb7ec19e235760eed606", // Fueling the Athlete / q6
  "02ee0a0ecf8d3afb93443cecc05714c9b83d9aa599c3f7711baea6539827e012", // Fueling the Athlete / q7
  "6b7045293f5fc90c81af47fefe9aff556efef6d6314ec363c38d378b17f2967c", // Supplements, Substances and the Coach's Line / q0
  "822845a66eca779cb71e70bbbfdda2c096b15d7e25b6b411464e3d123c57b99f", // Supplements, Substances and the Coach's Line / q1
  "e88b662006f8bfe9f1e12b8082632062e735db4f5d0977f0e7e0b9a27a787986", // Supplements, Substances and the Coach's Line / q2
  "6a8ce02de80e3091b10776a7cf097633dc5191c95bec9d5321294c72e947a27c", // Supplements, Substances and the Coach's Line / q3
  "3941142a2b385c9f74fff80b7397bc693332c7cd7f0f5d6f6228d9dca064d905", // Supplements, Substances and the Coach's Line / q4
  "41cd2e9e2325ed126da9de3272137e33ffe6618d51b8ef86cb029760d128bd8b", // Supplements, Substances and the Coach's Line / q5
  "c53dba344f29c316e2d8ea0051d8a0eff09ca37c769d31dfb9bb433c796e523f", // Supplements, Substances and the Coach's Line / q6
  "b5faeb1666d8f24b15c25981bd02ba6d988737bcfe941f12f11b2604c6d131e4", // Supplements, Substances and the Coach's Line / q7
  "9250a2a61e0510365cedec453eabf2bdecada38fe9c6dd75cefc3a434f1e06e8", // Writing a Resistance Program / q0
  "b490c8f19b3ea167797e39a26c10a1d4996d6a3b8ccb226247810e7704f80609", // Writing a Resistance Program / q1
  "e2192b0d1dec0c8424125ef925b4f814ca11080bb198f0b85170128bfe948855", // Writing a Resistance Program / q2
  "16188a8f150fe3a94b4446e6bf15115b30c9c29386144499b4487751c1dcdbc8", // Writing a Resistance Program / q3
  "75a468d5481e87a23101fd70caf4151c9dd6476c0d04472efb5621e9fb175f52", // Writing a Resistance Program / q4
  "9cc93caf87eb549b60e68c182d019cc6a833cc08cc2c57fc63440f4637a590a5", // Writing a Resistance Program / q5
  "d46cd89d6f238291fb957e9e57fa04e4fa2866e9a73f478d951a88184459e837", // Writing a Resistance Program / q6
  "99bda1ee16526260eb920bc203c41a670c2b4fe28066bc4c8d630f7e93da7d7a", // Writing a Resistance Program / q7
  "75cfdf23df9bb49aadca5244348eb3c5dc72f61745fde0763926151fe14e401f", // Aerobic Endurance Programming / q0
  "f411391e5fd8c755e6051c9d2e554eb4791f625361114092dbec790a5018af5b", // Aerobic Endurance Programming / q1
  "f5f97ba49473d320c7ec400503632f2ccba81550c49d0cb24dcfee951542f5b3", // Aerobic Endurance Programming / q2
  "6f418cea6ebf9bb90ab0f9e1084b00836e4e186c89b95b72aab92e0bee12f427", // Aerobic Endurance Programming / q3
  "49835ccd4ed70755815a2dc309a455feb025d5dbe865a2d1045a137d02212069", // Aerobic Endurance Programming / q4
  "ab0ce918b18b2d59c33e01e8fb6798b900c964260fe9ba9a49af9411221a4222", // Aerobic Endurance Programming / q5
  "cc5e293f5c4f05c2b1c339fc8336039753b147510f90aba31299aa353ef39144", // Aerobic Endurance Programming / q6
  "84aa216f2164c1d51215adba15d1e4823d79a00a1f611421b24db282ece5dc13", // Aerobic Endurance Programming / q7
  "d360c1572b1a13a0da17e251b22e0a52e104b1bbadcb286e6c45f9b47520dddf", // The Mind in Performance / q0
  "89efcbd80831207838c6949c6d5917894d1883e23cad579d27e6f41600d294ad", // The Mind in Performance / q1
  "f47e57bccb4a4077e11366c8bc68f4c2787255481fa076a3e075148104e24bff", // The Mind in Performance / q2
  "1c96d600e710c656da644a304ac13859097b6b45654aca114588ce81912f08eb", // The Mind in Performance / q3
  "9f27051fe0c76697785e2a56b43810d0de3ef0e46148defcfcd6ffc99fb4ef97", // The Mind in Performance / q4
  "9e5e33b02e8ac42920cf69add36409a4206346f99576570038528932dbe784bf", // The Mind in Performance / q5
  "c152f5509b44de2c20d93f79a91ef4059bd93ebf0d81e2ae00403198270be513", // The Mind in Performance / q6
  "83fa07714418419fd63a983b8a24f5812aad85a08f048d784531bca8697843d2", // The Mind in Performance / q7
  "7c3d452550b996dc9f96c8eadb7b6d482f8541f454bf8bb16e0ee5980e314b4b", // Training Women, Older Athletes and Athletes Coming Back / q0
  "e2409f892f5019906af69dd8030b489504079af5cfe71f2cf0a1e26007cff1f8", // Training Women, Older Athletes and Athletes Coming Back / q1
  "d204cdeff5ba8e6add952d72f91a8f4ea536364e8a4c2a7e84de9791a41551a6", // Training Women, Older Athletes and Athletes Coming Back / q2
  "c63e362377bc9d36dc424425b55c2cb1607b957b06ad97edc586e4a163aa0df2", // Training Women, Older Athletes and Athletes Coming Back / q3
  "820b7d49297e1dcc776433fd7ba2d6f8ac81bc59a3aef3a4ea33c7e0f3a95337", // Training Women, Older Athletes and Athletes Coming Back / q4
  "1c696e4e5ae26241e523e1281514525458cf530fd838e510e8e633c85b6b6b45", // Training Women, Older Athletes and Athletes Coming Back / q5
  "cb89745b39cbdd06d11654adba1c48d59bbd275d3dcdb29123b1da7d5b4dc4b6", // Training Women, Older Athletes and Athletes Coming Back / q6
  "190e2504dcb96c142ce662e983444f4a8194a72bec4f910af47778842c1964a2", // Training Women, Older Athletes and Athletes Coming Back / q7
  "eef5443396294e26486df3fb395b88c3e8b5d24f9ec2dbd302bdb2d06ca22296", // The Weight Room as a Facility / q0
  "922ec8343228d552c3823263a745fc16a14c1a8d780fccc50b3832ec176ab64c", // The Weight Room as a Facility / q1
  "2468f6fea377513eb1f2e7861e595a69bc37e361cd0c6892234462dfed3135ca", // The Weight Room as a Facility / q2
  "668d51303f7d43864eaa09402e68ea7e74e065beee5adcfe60204ec1e2845c99", // The Weight Room as a Facility / q3
  "06e3aabc7ac20bb05cc3844ea36c73c8bb3af1b3e08cdbea0b665e98de94e741", // The Weight Room as a Facility / q4
  "a3d8c4973392f711db5183b62d9200315b2b22c61205c1335217c9ced80158a2", // The Weight Room as a Facility / q5
  "bdf1d5ccff25df363e950cfc829b82ce819074cc299f61f4de61f43f2594b7f8", // The Weight Room as a Facility / q6
  "90f87fbed35b95e008a5c5195dde28c4eb90d24beecc96dab42672e44681e617", // The Weight Room as a Facility / q7
  "70a51f6a2f490396a4a63365b9102ee6609f90ea0e508ac01e33b8352eca9013", // Strength & Conditioning Fundamentals / q1 (2026-10-08)
  "f6e8cd7c564a42c80ff0e75383bab0e046c0acf85f8fcb0f9a48348feb61fb5e", // Energy Systems & Conditioning Design / q6 (2026-10-08)
  "89b8e3fb06dc21baae9ea408bd0775460c7e5aab261951500ced85fca5cf232a", // Speed & Agility Development / q6 (2026-10-08)
  "d63bc2613f2ee740c6541869ca6eaad0cbfa40a52d76da2f4a392f93ced64135", // Plyometrics & Power Development / q4 (2026-10-08)
  "d6e691cd0c567af629b27b125d124d1eece5732b5895ecf2334a724684ddff4d", // Lifting Technique, Spotting & Weight Room Safety / q6 (2026-10-08)
  "a635ff351c6a6a45add79032d5a1b41f4c7512acb5a24db603b235a8a4fd6f66", // Lifting Technique, Spotting & Weight Room Safety / q7 (2026-10-08)
  "ba0b4676601cd80afd8df217f0374d14b149a7151c8533abda563ffc92444a72", // How Muscle Produces Force / q2 (2026-10-08)
  "22bc0d530667b6c30a6f658de02410d2e13b4c4a8d626c4d9fd7eca715d142d4", // How Muscle Produces Force / q6 (2026-10-08)
  "4f342d924f8c917b24fbd0e1351ba506b24f1476e74c93a10ce9f7861bdfadea", // How Muscle Produces Force / q7 (2026-10-08)
  "0e98935575c66dc395c4f4c7697b780e9c3cb1858bb9c8a3e038c1231b6d69da", // Biomechanics for the Weight Room / q0 (2026-10-08)
  "c95830a6a3da559d97a3605b36aae046b08401aace46533e5180c10c6ac7515b", // Fueling the Athlete / q0 (2026-10-08)
  "a0d8bcb49dffe23c5687dd8eee82a396d463d8b56fdfe656c841afc146e0bdd2", // Fueling the Athlete / q1 (2026-10-08)
  "7c1432b34248ed35e7bd8a384b13bfbfbc8ef4ea5bacd319e6eec9d5ef84c92a", // Fueling the Athlete / q3 (2026-10-08)
  "c3ba13894f7e13cb9228db8b825aa3067fb2e3aa6cdfcab019fbf6628f9e7623", // Fueling the Athlete / q5 (2026-10-08)
  "09b9e1e56baa4b3b5d11a60faf9b88147a651ecd7ecd7ecec17a7ef33c9f38ba", // Aerobic Endurance Programming / q7 (2026-10-08)
  "fff5af1223287fcc78004da7cdf96e887a9773ae9203491ca0a38f2d5635cb51", // The Mind in Performance / q3 (2026-10-08)
  "8e0e3460eb21d6802c884b5b21829e1ae34b37acd346f204569a6fd31182db71", // The Mind in Performance / q5 (2026-10-08)
  "b237e71add9855caa6e45997801e3c71574f20c9f5877544e506ece185690aea", // Training Women, Older Athletes and Athletes Coming Back / q0 (2026-10-08)
  "1cbb5a73046c467dbc1ab3bd98e834db44ba2e1665858dbf527c1f962fa5488b", // Training Women, Older Athletes and Athletes Coming Back / q2 (2026-10-08)
  "7c4b2f37d1d2ddecc4529f7266ccf01eff642d4a4c3ec24e0615932a12fe6534", // The Weight Room as a Facility / q0 (2026-10-08)
]);

export function decideQuizQuestionResync(
  stored: HashableQuizQuestion,
  repo: HashableQuizQuestion,
): "unchanged" | "resync" | "admin_edited" {
  const storedHash = quizQuestionHash(stored);
  if (storedHash === quizQuestionHash(repo)) return "unchanged";
  return SHIPPED_QUIZ_QUESTION_HASHES.has(storedHash) ? "resync" : "admin_edited";
}

/** What the re-sync does with one stored lesson, as a pure decision so it can be unit-tested
 * without a database. */
export function decideLessonResync(
  storedContent: string,
  repoContent: string,
): "unchanged" | "resync" | "admin_edited" {
  if (storedContent === repoContent) return "unchanged";
  return SHIPPED_LESSON_CONTENT_HASHES.has(lessonContentHash(storedContent)) ? "resync" : "admin_edited";
}
