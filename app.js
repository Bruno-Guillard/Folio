(() => {
  'use strict';

  const els = {
    main: document.getElementById('main'),
    backBtn: document.getElementById('backBtn'),
    menuBtn: document.getElementById('menuBtn'),
    subtitle: document.getElementById('subtitle'),
    fab: document.getElementById('fab'),
    sheet: document.getElementById('sheet'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    sheetContent: document.getElementById('sheetContent'),
    backupFile: document.getElementById('backupFile'),
    syncBadge: document.getElementById('syncBadge')
  };

  const state = {
    folders: [],
    watches: [],
    view: { type: 'home', id: null },
    objectUrls: new Set(),
    editingWatchId: null,
    draftPhotos: [],
    suppressWatchClickUntil: 0,
    syncStatus: 'local',
    syncBusy: false,
    lastSyncError: '',
    miscExpenses: 0,
    miscExpensesUpdatedAt: 0,
    miscExpensesPendingSync: false
  };

  const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const euro = (v) => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : '—';
  const num = (v) => v === '' || v === null || v === undefined ? null : Number(v);
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const normalizeFolderName = (name='') => String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr');

  const isRepairFolder = folder => {
    const key = normalizeFolderName(folder?.name);
    return key === 'reparation' || key === 'reparations';
  };

  const repairFolderForItem = item => state.folders.find(f => f.id === item?.folderId && isRepairFolder(f)) || null;
  const isRepairItem = item => !!repairFolderForItem(item);

  const commonsFile = name => `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(name)}?width=960`;
  const commonsSource = name => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name).replace(/%20/g,'_')}`;

  const HISTORY_ERAS = [
    {
      key: '1940', label: '1940', title: 'Années 1940 — utilitaire, militaire et élégance sobre',
      image: commonsFile("Lanco dress watch, anni '40.jpg"),
      photoLabel: "Montre habillée Lanco, années 1940",
      credit: 'Clyde94 · CC BY-SA 4.0',
      source: "https://commons.wikimedia.org/wiki/File:Lanco_dress_watch,_anni_'40.jpg",
      intro: "La montre-bracelet est désormais installée. La guerre renforce la recherche de lisibilité, de robustesse et de synchronisation, tandis que le civil conserve de petites montres habillées très sobres.",
      recognize: ['30–36 mm souvent', 'Chiffres arabes lisibles', 'Petite seconde fréquente', 'Remontage manuel', 'Plexi et boîtiers fins'],
      examples: ['A-11 américaine', 'WWW britannique', 'Montres habillées à petite seconde']
    },
    {
      key: '1950', label: '1950', title: 'Années 1950 — élégance d’après-guerre et automatique',
      image: commonsFile("Jaeger-LeCoultre men's dress watch ca. 1950s.jpg"),
      photoLabel: "Jaeger-LeCoultre habillée, années 1950",
      credit: 'Kjetil Ree · CC BY-SA 3.0',
      source: "https://commons.wikimedia.org/wiki/File:Jaeger-LeCoultre_men's_dress_watch_ca._1950s.jpg",
      intro: "Les cadrans deviennent plus épurés, les index appliqués et les boîtiers plus élégants. Le remontage automatique se diffuse fortement et la montre-outil moderne commence à se structurer.",
      recognize: ['Cadrans crème / argent', 'Index appliqués', 'Boîtiers or ou acier', 'Automatique en essor', 'Diamètres encore contenus'],
      examples: ['Dress watches suisses', 'Premières plongeuses modernes', 'Date et réserve de marche']
    },
    {
      key: '1960', label: '1960', title: 'Années 1960 — âge d’or de la montre-outil',
      image: commonsFile('Jaeger-LeCoultre Memovox model E855 with calibre K825 (2).JPG'),
      photoLabel: 'Jaeger-LeCoultre Memovox automatique, années 1960',
      credit: 'Ghilt · CC BY-SA 3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Jaeger-LeCoultre_Memovox_model_E855_with_calibre_K825_(2).JPG',
      intro: "Plongée, aviation, chronographe, alarme et exploration donnent naissance à des designs très fonctionnels. En fin de décennie, l’électronique et le quartz annoncent une rupture majeure.",
      recognize: ['Acier très présent', 'Lunettes tournantes', 'Chronographes', 'Automatiques robustes', 'Cadrans très lisibles'],
      examples: ['Montres de plongée', 'Chronographes de sport', 'Montres à alarme', 'Quartz Astron en 1969']
    },
    {
      key: '1970', label: '1970', title: 'Années 1970 — quartz, formes audacieuses et affichage digital',
      image: commonsFile('Pulsar P4 Time Computer 3215-2 LED display watch circa 1975.png'),
      photoLabel: 'Pulsar P4 LED, vers 1975',
      credit: 'Jonathan Mauer · CC BY 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Pulsar_P4_Time_Computer_3215-2_LED_display_watch_circa_1975.png',
      intro: "Le quartz bouleverse l’industrie. LED puis LCD côtoient encore les mécaniques automatiques. Les designers expérimentent : boîtiers TV, tonneau, coussin, bracelets intégrés et cadrans colorés.",
      recognize: ['Boîtiers TV / tonneau', 'Bracelets intégrés', 'Couleurs fortes', 'LED et LCD', 'Jour-date très courant'],
      examples: ['Pulsar LED', 'Seiko 6139', 'Quartz analogique', 'Montres TV']
    },
    {
      key: '1980', label: '1980', title: 'Années 1980 — quartz démocratique, plastique et fun',
      image: commonsFile('Odyssey Quartz Panther digital watch c 1982 (front date).jpg'),
      photoLabel: 'Montre digitale quartz économique, vers 1982',
      credit: 'Multicherry · CC BY-SA 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Odyssey_Quartz_Panther_digital_watch_c_1982_(front_date).jpg',
      intro: "Le quartz devient le standard du quotidien. Les digitales bon marché se multiplient, le plastique assume la couleur et le design devient un terrain de jeu. Swatch apparaît en 1983 et G-Shock la même année.",
      recognize: ['LCD omniprésent', 'Résine / plastique', 'Boîtiers très fins ou sportifs', 'Couleurs', 'Fonctions alarme / chrono'],
      examples: ['Digitales LCD', 'Swatch', 'Premières G-Shock', 'Quartz habillées fines']
    },
    {
      key: '1990', label: '1990', title: 'Années 1990 — retour du mécanique et néo-vintage',
      image: commonsFile('Before-and-after comparison of photo retouche on Poljot Buran chronograph wristwatch from about 1990.jpg'),
      photoLabel: 'Chronographe mécanique Poljot Buran, vers 1990',
      credit: 'Pittigrilli · CC BY-SA 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Before-and-after_comparison_of_photo_retouche_on_Poljot_Buran_chronograph_wristwatch_from_about_1990.jpg',
      intro: "Le quartz reste dominant, mais la montre mécanique redevient désirable chez les amateurs. Les maisons remettent en avant complications, chronographes et héritage, tandis que le sport reste très présent.",
      recognize: ['Quartz toujours majoritaire', 'Retour mécanique', 'Chronographes', 'Sport / tool watches', 'Premiers codes néo-vintage'],
      examples: ['Chronographes mécaniques', 'Montres de plongée', 'Quartz sport', 'Rééditions patrimoniales']
    },
    {
      key: '2000', label: '2000', title: 'Années 2000 — grandes tailles et montre comme objet de style',
      image: commonsFile('2006090201 Casio-G-shock.Mod.3017-GW-056E 2006.jpg'),
      photoLabel: 'Casio G-Shock GW-056E, 2006',
      credit: 'VSchagow · CC BY-SA 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:2006090201_Casio-G-shock.Mod.3017-GW-056E_2006.jpg',
      intro: "Les diamètres augmentent nettement. Les montres sportives et techniques deviennent massives, tandis que le haut de gamme mécanique connaît une forte croissance et remet les complications au premier plan.",
      recognize: ['40 mm et plus fréquent', 'Boîtiers épais', 'Sport très marqué', 'Acier / caoutchouc', 'Complications visibles'],
      examples: ['G-Shock techniques', 'Chronographes XXL', 'Plongeuses imposantes', 'Haute horlogerie mécanique']
    },
    {
      key: '2010', label: '2010 →', title: '2010 à aujourd’hui — smartwatch, micro-marques et retour aux proportions vintage',
      image: commonsFile('Apple Watch.jpg'),
      photoLabel: 'Apple Watch, 2015',
      credit: 'raneko · CC BY 2.0',
      source: 'https://commons.wikimedia.org/wiki/File:Apple_Watch.jpg',
      intro: "La montre connectée crée une nouvelle branche du marché. En parallèle, les micro-marques se multiplient et l’horlogerie mécanique redécouvre progressivement des diamètres plus contenus, le néo-vintage et les rééditions historiques.",
      recognize: ['Smartwatches', 'Micro-marques', 'Néo-vintage', 'Retour 36–39 mm', 'Bracelets intégrés et rééditions'],
      examples: ['Montres connectées', 'Rééditions patrimoniales', 'Micro-marques', 'Petits diamètres en retour']
    }
  ];

  const HISTORY_ERA_DETAILS = {
  "1940": [
    {
      "name": "Waltham Type A-11",
      "file": "Waltham Type A-11 Hack Navigational, 1942.jpg",
      "period": "1942",
      "typical": "Architecture militaire très fonctionnelle : boîtier rond compact, cadran sombre, grands chiffres arabes, minuterie très lisible et dispositif de stop-seconde pour synchroniser les hommes.",
      "heritage": "Elle conserve les proportions contenues et les cornes fines des années 1930, ainsi que le remontage manuel et une construction encore proche de la montre habillée.",
      "next": "Elle fixe le vocabulaire de la field watch d’après-guerre : contraste élevé, priorité à la lisibilité et robustesse avant décoration.",
      "note": ""
    },
    {
      "name": "ATP britannique",
      "file": "Wristlet watch (AM 18115-1).jpg",
      "period": "vers 1940",
      "typical": "Petit diamètre, petite seconde à 6 h, aiguilles luminescentes et cadran extrêmement direct : la fonction domine nettement l’esthétique.",
      "heritage": "La petite seconde et les cornes encore assez délicates prolongent les montres civiles des années 1930.",
      "next": "La minuterie périphérique, la luminescence et l’acier annoncent les montres militaires et utilitaires des années 1950.",
      "note": ""
    },
    {
      "name": "Hamilton homme",
      "file": "Vintage Hamilton Men's Wrist Watch, 17 Jewels, Made In USA, Circa 1940s (16838342505).jpg",
      "period": "années 1940",
      "typical": "Montre civile compacte avec cadran clair, chiffres/index fins et boîtier encore très dessiné : le raffinement reste important malgré la simplification générale de la décennie.",
      "heritage": "Les cornes travaillées et les proportions étroites viennent directement du langage Art déco des années 1930.",
      "next": "La lisibilité plus simple et le cadran moins décoratif annoncent la dress watch épurée des années 1950.",
      "note": ""
    },
    {
      "name": "Gruen Veri-Thin",
      "file": "Vintage Gruen Veri-Thin Men's Wrist Watch, 17 Jewels, Case Made In USA, Swiss Movement, Circa 1940 (35425955401).jpg",
      "period": "vers 1940",
      "typical": "Boîtier fin, cadran clair, index/chiffres allongés et forte recherche d’élégance : c’est la branche habillée des années 1940.",
      "heritage": "La finesse et les cornes expressives héritent de l’Art déco tardif.",
      "next": "La recherche de minceur et d’index appliqués plus graphiques prépare directement les montres habillées des années 1950.",
      "note": ""
    },
    {
      "name": "Minerva 40BR",
      "file": "Minerva 40BR.jpg",
      "period": "vers 1940",
      "typical": "Chronographe à poussoirs séparés, cadran multi-échelles et sous-compteurs : la montre devient un véritable instrument tout en restant de taille contenue.",
      "heritage": "Le boîtier rond classique et les aiguilles fines restent très proches des chronographes des années 1930.",
      "next": "La densité fonctionnelle du cadran annonce les chronographes sportifs et professionnels qui exploseront dans les années 1960.",
      "note": ""
    },
    {
      "name": "Universal Genève Tri-Compax",
      "file": "Universal-Geneve Tri-Compax.jpg",
      "period": "famille née en 1944",
      "typical": "Composition complexe mais équilibrée, multiples sous-compteurs et calendrier : la haute complication se porte désormais au poignet sans perdre l’élégance.",
      "heritage": "Le cadran symétrique et les boîtiers fins restent issus des codes classiques d’avant-guerre.",
      "next": "La combinaison complication + sport préfigure les chronographes sophistiqués des années 1950 et 1960.",
      "note": ""
    },
    {
      "name": "Lanco habillée",
      "file": "Lanco dress watch, anni '40.jpg",
      "period": "années 1940",
      "typical": "Petite montre habillée, lunette fine, cadran clair et index sobres : une silhouette typique du civil pendant et juste après la guerre.",
      "heritage": "Ses cornes relativement travaillées et sa petite taille gardent la sophistication des années 1930.",
      "next": "Le cadran plus aéré et les index géométriques annoncent le minimalisme chic des années 1950.",
      "note": ""
    },
    {
      "name": "Bovet",
      "file": "Bovet August 1944.jpg",
      "period": "1944",
      "typical": "Montre de petite taille avec forte verticalité du boîtier et détails encore très classiques, représentative d’un marché où la montre n’est pas encore devenue massive.",
      "heritage": "La forme étirée et la décoration du boîtier prolongent le goût Art déco.",
      "next": "La simplification du cadran et l’usage quotidien au poignet annoncent l’élégance plus rationnelle des années 1950.",
      "note": ""
    },
    {
      "name": "Tutima Fliegerchronograph",
      "file": "Tutima Glashütte Fliegerchronograph from World War II.jpg",
      "period": "Seconde Guerre mondiale",
      "typical": "Chronographe de pilote à cadran sombre, forte lisibilité, poussoirs larges et construction utilitaire : ici la forme répond directement à l’usage aéronautique.",
      "heritage": "Le mouvement manuel et le boîtier rond conservent la mécanique traditionnelle des années 1930.",
      "next": "Il annonce les montres-outils de pilote et les chronographes professionnels qui deviendront centraux dans les années 1950-1960.",
      "note": ""
    },
    {
      "name": "Mathey-Tissot Calamatic",
      "file": "Mathey-tissot calamatic 1947.jpg",
      "period": "1947",
      "typical": "Silhouette civile de l’immédiat après-guerre : boîtier compact, cadran clair et index plus propres, avec une présence moins décorative qu’avant-guerre.",
      "heritage": "Les cornes restent encore sculptées, signe de la transition depuis les années 1930-40.",
      "next": "La sobriété générale et l’automatisation progressive annoncent la montre habillée moderne des années 1950.",
      "note": ""
    }
  ],
  "1950": [
    {
      "name": "Doxa Automatic",
      "file": "Doxa Automatic Watch, c.1950 01.jpg",
      "period": "vers 1950",
      "typical": "Cadran clair très propre, index appliqués, petite taille et surtout remontage automatique : la modernité technique entre dans la montre habillée.",
      "heritage": "Les cornes encore marquées et les proportions fines viennent directement des années 1940.",
      "next": "L’automatique généralisé et le cadran épuré annoncent la montre suisse des années 1960.",
      "note": ""
    },
    {
      "name": "Jaeger-LeCoultre habillée",
      "file": "Jaeger-LeCoultre men's dress watch ca. 1950s.jpg",
      "period": "années 1950",
      "typical": "Index bâtons appliqués, cadran argenté, lunette fine et grande sobriété : le luxe passe désormais par la pureté plutôt que par la décoration.",
      "heritage": "Le diamètre contenu et la finesse restent hérités des années 1940.",
      "next": "Les index droits et la géométrie du cadran deviennent un langage dominant dans les années 1960.",
      "note": ""
    },
    {
      "name": "Movado or",
      "file": "Montre Movado.jpg",
      "period": "vers 1950",
      "typical": "Boîtier précieux, cadran très ouvert et bracelet intégré visuellement au boîtier : une élégance plus architecturale apparaît.",
      "heritage": "La petite taille et le travail du métal prolongent la tradition habillée des années 1940.",
      "next": "La recherche de continuité boîtier-bracelet préfigure les expérimentations de formes des années 1960-70.",
      "note": ""
    },
    {
      "name": "Omega 17 rubis",
      "file": "Vintage Omega Men's 17-Jewel Wrist Watch, Swiss-Made, Circa 1950s (13827062045).jpg",
      "period": "années 1950",
      "typical": "Cadran clair, index appliqués et boîtier rond équilibré : l’archétype de la montre habillée masculine de l’après-guerre.",
      "heritage": "Les proportions restent plus petites et plus fines que celles qui viendront ensuite.",
      "next": "La simplification du cadran et l’acier plus présent ouvrent la voie aux montres polyvalentes des années 1960.",
      "note": ""
    },
    {
      "name": "Tissot « cioccolatino »",
      "file": "Tissot \"cioccolatino\" in oro, anni '50.jpg",
      "period": "années 1950",
      "typical": "Boîtier rectangulaire compact et or : les formes non rondes restent très présentes dans la montre habillée, mais avec un dessin plus net qu’avant-guerre.",
      "heritage": "La géométrie rectangulaire est un héritage direct de l’Art déco.",
      "next": "Le boîtier plus intégré et la simplification des surfaces annoncent les formes coussin/TV des décennies suivantes.",
      "note": ""
    },
    {
      "name": "Tissot 15.3",
      "file": "Tissot 15.3, primi anni '50.jpg",
      "period": "début des années 1950",
      "typical": "Petite montre ronde, cadran clair et typographie fine : la transition depuis les années 1940 est encore très visible.",
      "heritage": "Les cornes fines et la taille très contenue restent typiquement quarante.",
      "next": "Les index plus sobres et la lisibilité plus directe annoncent le modernisme des années 1960.",
      "note": ""
    },
    {
      "name": "Tissot 871",
      "file": "Tissot 871 (base Lemania 1281), anni '50.jpg",
      "period": "années 1950",
      "typical": "Chronographe habillé : les fonctions sportives se combinent avec un boîtier encore élégant et contenu.",
      "heritage": "La disposition des sous-compteurs reprend les chronographes des années 1940.",
      "next": "La vocation plus sportive et la présence accrue de l’acier annoncent l’âge d’or du chronographe des années 1960.",
      "note": ""
    },
    {
      "name": "Tissot chronographe",
      "file": "Tissot cronografo risalente a metà anni Cinquanta.jpg",
      "period": "milieu des années 1950",
      "typical": "Cadran dense mais organisé, poussoirs nets et boîtier acier : la montre outil devient compatible avec une utilisation quotidienne.",
      "heritage": "Le diamètre et les aiguilles restent encore très classiques.",
      "next": "La lecture plus sportive préfigure les chronographes de course et d’aviation des années 1960.",
      "note": ""
    },
    {
      "name": "Breitling Premier calendrier",
      "file": "Breitling Premier cronografo con calendario, anni '50.jpg",
      "period": "années 1950",
      "typical": "Chronographe à calendrier très sophistiqué, mais présenté dans une enveloppe élégante : la complication reste raffinée plutôt que massive.",
      "heritage": "La construction du boîtier et les poussoirs ronds restent hérités des chronographes des années 1940.",
      "next": "La multiplication des fonctions prépare les cadrans instrumentaux des années 1960.",
      "note": ""
    },
    {
      "name": "Omega Seamaster",
      "file": "Omega Seamaster ca. 1960.jpg",
      "period": "vers 1960 — transition",
      "typical": "Boîtier acier polyvalent, index simples et étanchéité plus crédible : la montre habillée commence à devenir une montre de tous les jours.",
      "heritage": "Le cadran clair et la finesse restent profondément années 1950.",
      "next": "L’acier, la robustesse et le dessin plus fonctionnel annoncent très clairement les années 1960.",
      "note": ""
    }
  ],
  "1960": [
    {
      "name": "Omega Seamaster",
      "file": "Omega Seamaster ca. 1960.jpg",
      "period": "vers 1960",
      "typical": "Acier, cadran clair très lisible et boîtier polyvalent : la montre sportive élégante devient un standard.",
      "heritage": "Elle garde les proportions mesurées et les index appliqués des années 1950.",
      "next": "Sa robustesse et son aspect plus utilitaire annoncent l’explosion des montres-outils de la décennie.",
      "note": ""
    },
    {
      "name": "Enicar Ultrasonic « Cioccolatone »",
      "file": "1961 Enicar Ultrasonic gold-plated \"Cioccolatone\" design.jpg",
      "period": "1961",
      "typical": "Boîtier carré/coussin plus large et présence graphique forte : on commence à sortir franchement du petit rond classique.",
      "heritage": "La finition dorée et le cadran habillé restent hérités des années 1950.",
      "next": "La masse du boîtier et sa géométrie annoncent les coussins et TV cases des années 1970.",
      "note": ""
    },
    {
      "name": "Tissot Visodate",
      "file": "Tissot Visodate, anni '60.jpg",
      "period": "années 1960",
      "typical": "Date visible, index bâtons et boîtier acier : la montre de ville devient plus pratique et plus moderne.",
      "heritage": "Elle conserve la finesse et le cadran argenté des dress watches des années 1950.",
      "next": "La date et les lignes plus droites annoncent les montres jour-date omniprésentes des années 1970.",
      "note": ""
    },
    {
      "name": "Tissot Seastar Visodate",
      "file": "Tissot Seastar Visodate automatico, anni '60.jpg",
      "period": "années 1960",
      "typical": "Automatique, date et vocation plus robuste : la montre habillée absorbe des fonctions autrefois réservées aux montres techniques.",
      "heritage": "Les index fins et la sobriété du cadran restent cinquante.",
      "next": "Le mélange élégance/robustesse annonce les sport-chic et bracelets intégrés des années 1970.",
      "note": ""
    },
    {
      "name": "ARSA manuel",
      "file": "ARSA a carica manuale anni 60 circa.jpg",
      "period": "années 1960",
      "typical": "Cadran simple, index droits et boîtier rond sans excès : un bon exemple du modernisme discret de la décennie.",
      "heritage": "Le remontage manuel et le diamètre contenu sont encore dans la continuité des années 1950.",
      "next": "La géométrie plus franche des index prépare les cadrans graphiques des années 1970.",
      "note": ""
    },
    {
      "name": "Raketa militaire",
      "file": "Raketa soviet-era military watch.jpg",
      "period": "années 1960",
      "typical": "Cadran très lisible, boîtier utilitaire et esthétique fonctionnelle : la montre-outil se décline dans de nombreux pays.",
      "heritage": "Le diamètre et la construction simple prolongent les field watches des années 1940-50.",
      "next": "Le nylon, la robustesse et la forte identité graphique annoncent les tool watches très présentes dans les années 1970.",
      "note": ""
    },
    {
      "name": "Saturn soviétique",
      "file": "Сатурн часы, 1960-е.jpg",
      "period": "années 1960",
      "typical": "Cadran clair, index très dessinés et boîtier à la géométrie plus affirmée : le style devient moins conservateur.",
      "heritage": "La taille et la structure restent celles d’une montre habillée des années 1950.",
      "next": "Les formes plus épaisses et graphiques annoncent la liberté de dessin des années 1970.",
      "note": ""
    },
    {
      "name": "Vostok Amphibia",
      "file": "Часы Восток-Амфибия, сделано в СССР.jpg",
      "period": "fin des années 1960",
      "typical": "Boîtier de plongée, lunette tournante et étanchéité : la fonction sportive impose une nouvelle silhouette.",
      "heritage": "Elle hérite de la recherche de robustesse et de lisibilité des montres militaires précédentes.",
      "next": "Le volume du boîtier et l’usage de la couleur sur la lunette annoncent les plongeuses très expressives des années 1970.",
      "note": ""
    },
    {
      "name": "Bulova Accutron 214",
      "file": "Vintage Bulova Accutron Men's Wrist Watch, Date Code M3 (1963), The Watch That Hums, Model 214, The First Model Of Accutron Watches (18413120563).jpg",
      "period": "1963",
      "typical": "Technologie à diapason : la précision électronique apparaît tout en conservant l’affichage analogique classique.",
      "heritage": "Le boîtier et les index restent visuellement proches d’une montre mécanique des années 1950.",
      "next": "L’électronique prépare directement la révolution quartz des années 1970.",
      "note": ""
    },
    {
      "name": "Seiko Astron 35A",
      "file": "Seiko Astron.jpg",
      "period": "1969",
      "typical": "Première montre quartz commercialisée : techniquement révolutionnaire, mais volontairement présentée dans un boîtier doré encore très classique.",
      "heritage": "Son apparence reste proche d’une dress watch haut de gamme des années 1960.",
      "next": "Son mouvement quartz annonce la transformation totale du marché dans les années 1970 et 1980.",
      "note": ""
    }
  ],
  "1970": [
    {
      "name": "Pulsar P4 Time Computer",
      "file": "Pulsar P4 Time Computer 3215-2 LED display watch circa 1975.png",
      "period": "vers 1975",
      "typical": "Affichage LED rouge, façade sombre et boîtier-bracelet très intégré : le cadran traditionnel disparaît complètement.",
      "heritage": "La fascination pour l’électronique vient des Accutron et premières quartz des années 1960.",
      "next": "L’affichage numérique annonce les LCD légères et bon marché des années 1980.",
      "note": ""
    },
    {
      "name": "Bulova Computron",
      "file": "Vintage Bulova Computron Digital Quartz Watch With Matching Band, Red LED Display, Goldtone Finish, Circa 1976 (26810030187).jpg",
      "period": "1976",
      "typical": "Boîtier asymétrique de type driver, LED latérale et bracelet intégré : le design assume une rupture totale avec la montre ronde.",
      "heritage": "La finition dorée garde un lien avec le luxe traditionnel des décennies précédentes.",
      "next": "Le boîtier conceptuel et l’électronique préfigurent la montre-tech objet de mode des années 1980.",
      "note": ""
    },
    {
      "name": "Timeton digital",
      "file": "Digitaluhr Timeton 1979.JPG",
      "period": "1979",
      "typical": "LCD lisible en permanence, boîtier rectangulaire et fonctions numériques : la montre devient un petit appareil électronique.",
      "heritage": "Elle reprend la logique digitale née avec les LED du milieu des années 1970.",
      "next": "La simplicité de l’affichage et le coût réduit annoncent directement les Casio mass-market des années 1980.",
      "note": ""
    },
    {
      "name": "Lucien Piccard DSM LCD",
      "file": "Lucien Piccard DSM LCD Watch.jpg",
      "period": "années 1970",
      "typical": "Écran LCD encadré par un boîtier encore bijou : électronique et codes de luxe coexistent.",
      "heritage": "Les finitions métalliques et le bracelet travaillé viennent de la montre habillée traditionnelle.",
      "next": "Le LCD devient la norme numérique des années 1980, souvent dans des boîtiers plus légers et plastiques.",
      "note": ""
    },
    {
      "name": "Zenith TimeCommand",
      "file": "Vintage Zenith Swiss-Made TimeComand Watch, Quartz Movement, Analog Time With LED Digital Readout, Souvenir Of The 1977 NHL All Star Game , Back Engraved Peter McNab, Bruins (29642324957).jpg",
      "period": "1977",
      "typical": "Affichage hybride analogique + LED : l’industrie expérimente avant que les formats ne se stabilisent.",
      "heritage": "Les aiguilles et le cadran conservent une lecture traditionnelle héritée des années 1960.",
      "next": "L’hybridation annonce les ana-digi et montres multifonctions des années 1980-90.",
      "note": ""
    },
    {
      "name": "Aquadive Time-Depth",
      "file": "1972 Aquadive Time-Depth wrist watch.jpg",
      "period": "1972",
      "typical": "Boîtier massif de plongeuse/instrument, cadran très fonctionnel et présence technique forte : le volume devient un élément de style.",
      "heritage": "L’ADN de plongeuse vient directement des montres-outils des années 1960.",
      "next": "Les volumes protecteurs et la technicité annoncent les grandes montres sport des années 1980 puis 2000.",
      "note": ""
    },
    {
      "name": "Tissot PR 516 GL",
      "file": "Tissot Armbanduhr Automatic PR 516 GL (1972).jpg",
      "period": "1972",
      "typical": "Boîtier coussin et bracelet intégré : l’objet se pense désormais comme une seule architecture continue.",
      "heritage": "Le cadran analogique et l’automatique restent issus de la tradition mécanique des années 1960.",
      "next": "Le bracelet intégré deviendra un code sport-chic majeur, réinterprété dans les décennies suivantes.",
      "note": ""
    },
    {
      "name": "ARSA coussin dégradé",
      "file": "ARSA a carica manuale con cassa a cuscino e quadrante degradé, anni '70 circa.jpg",
      "period": "années 1970",
      "typical": "Caisse coussin, cadran dégradé et proportions plus larges : trois marqueurs visuels très typiques de la décennie.",
      "heritage": "Le remontage manuel et les index restent techniquement classiques.",
      "next": "Le traitement couleur et la simplification des formes annoncent la montre mode des années 1980.",
      "note": ""
    },
    {
      "name": "Omega Seamaster automatique",
      "file": "Omega Seamaster automatico ref. 166.087, anni Settanta.jpg",
      "period": "années 1970",
      "typical": "Boîtier plus massif, angles plus francs et cadran très géométrique : même la montre suisse traditionnelle adopte le langage seventies.",
      "heritage": "L’automatique et la vocation polyvalente viennent des Seamaster des années 1950-60.",
      "next": "La simplification de la carrure prépare les quartz minces et intégrées des années 1980.",
      "note": ""
    },
    {
      "name": "Ancre Antishoc",
      "file": "1970s Watch Ancre Antishoc stainless steel back antmagnetic (51878890718).jpg",
      "period": "années 1970",
      "typical": "Montre mécanique populaire à boîtier large et dessin simple : les formes audacieuses ne sont plus réservées au haut de gamme.",
      "heritage": "Le cadran analogique et les index bâtons prolongent la normalisation des années 1960.",
      "next": "La démocratisation du design prépare l’explosion des montres quartz accessibles des années 1980.",
      "note": ""
    }
  ],
  "1980": [
    {
      "name": "Swatch GB101",
      "file": "Swatch GB101.jpg",
      "period": "1983",
      "typical": "Boîtier plastique monobloc, cadran graphique et construction simplifiée : la montre devient un produit de mode industriel assumé.",
      "heritage": "La couleur et la liberté de design viennent des expérimentations des années 1970.",
      "next": "Le principe de collection, de séries et de renouvellement rapide annonce la montre-accessoire des années 1990.",
      "note": ""
    },
    {
      "name": "Prototype Swatch",
      "file": "Swatch proto 1981.jpg",
      "period": "1981",
      "typical": "Réduction du nombre de pièces, plastique et géométrie très simple : l’objectif est autant industriel qu’esthétique.",
      "heritage": "Le quartz et le minimalisme électronique sont hérités de la décennie précédente.",
      "next": "Cette logique de produit accessible et design ouvrira la voie aux collections massives des années 1990.",
      "note": ""
    },
    {
      "name": "Swatch 1985",
      "file": "Swatch-1985 hg.jpg",
      "period": "1985",
      "typical": "Couleurs franches, cadran comme support graphique et bracelet plastique : l’horlogerie assume pleinement la culture pop.",
      "heritage": "Les palettes fortes prolongent les cadrans colorés des années 1970.",
      "next": "L’idée de montre identitaire, presque vestimentaire, s’amplifiera dans les années 1990.",
      "note": ""
    },
    {
      "name": "Casio AX-1",
      "file": "Casio AX-1.jpg",
      "period": "années 1980",
      "typical": "Boîtier rectangulaire, LCD et boutons multiples : l’esthétique est directement dictée par l’électronique et les fonctions.",
      "heritage": "Il descend directement des LCD apparus à la fin des années 1970.",
      "next": "La miniaturisation et les fonctions multiples annoncent les databanks, radio-pilotées et wearables ultérieurs.",
      "note": ""
    },
    {
      "name": "Casio TC500",
      "file": "Casio TC500 Touch Sensor Watch.jpg",
      "period": "1983",
      "typical": "Capteur tactile sur le verre : l’interaction avec la montre dépasse déjà le simple poussoir mécanique.",
      "heritage": "Le format LCD carré reste typiquement issu des digitales des années 1970.",
      "next": "L’interface tactile préfigure très directement les montres connectées des années 2010.",
      "note": ""
    },
    {
      "name": "Casio CA-502",
      "file": "Casio CA-502 (1984) (48403055572).jpg",
      "period": "1984",
      "typical": "Clavier calculatrice, LCD et bracelet métal : la montre devient un terminal personnel miniature.",
      "heritage": "L’affichage et la forme rectangulaire viennent de la révolution digitale des années 1970.",
      "next": "La concentration de fonctions annonce les montres databank des années 1990 puis les smartwatches.",
      "note": ""
    },
    {
      "name": "Piratron LCD",
      "file": "LCD-Uhr Piratron 1985.jpg",
      "period": "1985",
      "typical": "Digital très lisible, boîtier simple et électronique standardisée : le quartz est désormais complètement quotidien.",
      "heritage": "La technologie est l’aboutissement des expérimentations LED/LCD des années 1970.",
      "next": "La banalisation de l’électronique prépare une décennie 1990 où le quartz devient invisible parce qu’omniprésent.",
      "note": ""
    },
    {
      "name": "Tissot RockWatch",
      "file": "Tissot Rockwatch, circa 1985.jpg",
      "period": "vers 1985",
      "typical": "Boîtier en pierre et design conceptuel : la matière elle-même devient le sujet de la montre.",
      "heritage": "L’expérimentation de matériaux et de formes prolonge la liberté créative des années 1970.",
      "next": "Cette logique de design-objet annonce les collections lifestyle et les séries limitées des années 1990-2000.",
      "note": ""
    },
    {
      "name": "Breil quartz sport-chic",
      "file": "Breil al quarzo, metà anni '80 circa, omaggio all'Audemars Piguet Royal Oak..jpg",
      "period": "milieu des années 1980",
      "typical": "Bracelet intégré, lunette géométrique et quartz : les codes luxueux des années 1970 sont démocratisés par l’électronique.",
      "heritage": "Le bracelet intégré vient directement du sport-chic seventies.",
      "next": "La combinaison métal/quartz et dessin affirmé restera très présente dans les années 1990.",
      "note": ""
    },
    {
      "name": "Omega Seamaster quartz Séoul",
      "file": "Omega Seamaster crono al quarzo celebrativo delle Olimpiadi di Seoul del 1988 in cui Omega ha ricoperto il ruolo di cronometrista ufficiale.jpg",
      "period": "1988",
      "typical": "Chronographe quartz sportif, fonctions nombreuses et esthétique très instrumentale : le quartz est aussi haut de gamme.",
      "heritage": "La vocation sport/outil vient des chronographes des années 1960-70.",
      "next": "Le mélange technique + prestige prépare les grandes montres sport des années 1990-2000.",
      "note": ""
    }
  ],
  "1990": [
    {
      "name": "Tissot PRX",
      "file": "Tissot PRX dei primi anni '90.jpg",
      "period": "début des années 1990",
      "typical": "Bracelet intégré, boîtier plat et quartz : le sport-chic des années 1970 est devenu plus fin et plus rationnel.",
      "heritage": "L’architecture intégrée vient directement des années 1970-80.",
      "next": "La sobriété de surface et les proportions contenues annoncent le retour néo-vintage des années 2010.",
      "note": ""
    },
    {
      "name": "Swatch Autoquarz",
      "file": "Swatch Swiss Autoquarz, 1998.jpg",
      "period": "1998",
      "typical": "La montre populaire réintroduit une dimension mécanique/énergétique dans un univers dominé par le quartz.",
      "heritage": "Le boîtier coloré et l’esprit ludique viennent des Swatch des années 1980.",
      "next": "Le regain d’intérêt pour le fonctionnement mécanique annonce la renaissance horlogère des années 2000.",
      "note": ""
    },
    {
      "name": "Swatch SPMZ105",
      "file": "Swatch Uhr.jpg",
      "period": "1997",
      "typical": "Design, packaging et série deviennent aussi importants que la fonction horaire : la montre est pleinement un objet culturel.",
      "heritage": "Elle prolonge la logique mode et collection de la Swatch des années 1980.",
      "next": "Cette approche de marque/lifestyle annonce les collaborations et micro-séries des années 2000-2010.",
      "note": ""
    },
    {
      "name": "Tissot Ceraten",
      "file": "Tissot Ceraten, fine anni '80-primi anni '90.jpg",
      "period": "fin 1980 / début 1990",
      "typical": "Céramique, lignes très lisses et bracelet intégré : le matériau high-tech donne une esthétique plus froide et minimaliste.",
      "heritage": "La géométrie et le quartz viennent des années 1980.",
      "next": "La céramique technique deviendra un matériau majeur du haut de gamme des années 2000.",
      "note": ""
    },
    {
      "name": "Mondia Mistral Moonphase",
      "file": "Mondia Mistral Moonphase al quarzo, fine anni '80 - inizio anni '90.jpg",
      "period": "fin 1980 / début 1990",
      "typical": "Le quartz se pare de complications visuelles classiques comme la phase de lune : technologie moderne, apparence patrimoniale.",
      "heritage": "Le quartz et les boîtiers fins restent typiquement années 1980.",
      "next": "Le retour des codes historiques annonce la vague néo-vintage et la renaissance mécanique des années 2000.",
      "note": ""
    },
    {
      "name": "Chronoswiss",
      "file": "Chronoswiss 1989.jpg",
      "period": "1989 — repère de transition",
      "typical": "Boîtier classique, cadran très horloger et mécanique mise en avant : l’amateur recommence à valoriser le mouvement et l’artisanat.",
      "heritage": "La taille reste relativement contenue et le dessin s’oppose volontairement au plastique/quartz des années 1980.",
      "next": "Cette posture patrimoniale devient l’un des grands moteurs du renouveau mécanique des années 1990-2000.",
      "note": ""
    },
    {
      "name": "Poljot Buran",
      "file": "Before-and-after comparison of photo retouche on Poljot Buran chronograph wristwatch from about 1990.jpg",
      "period": "vers 1990",
      "typical": "Chronographe mécanique au dessin classique : un bon contrepoint au quartz dominant, révélateur de la persistance des mouvements mécaniques.",
      "heritage": "La construction s’inscrit dans la continuité des chronographes utilitaires des décennies précédentes.",
      "next": "La redécouverte du chronographe mécanique annonce le marché collectionneur des années 2000.",
      "note": ""
    },
    {
      "name": "Swatch Irony",
      "file": "Swatch Irony da donna, fine anni '90 - inizio anni 2000.jpg",
      "period": "fin 1990 / début 2000",
      "typical": "Le langage Swatch quitte le tout-plastique pour le métal : la montre mode cherche plus de perception de qualité.",
      "heritage": "La logique de collection et le quartz viennent des années 1980-90.",
      "next": "Le métal, l’épaisseur et le look plus premium annoncent les montres lifestyle des années 2000.",
      "note": ""
    },
    {
      "name": "Junghans MEGA 1",
      "file": "Junghans-MEGA1-watch.jpg",
      "period": "1990",
      "typical": "Première montre-bracelet radio-pilotée : la précision vient désormais d’un signal externe, sans modifier radicalement l’usage quotidien.",
      "heritage": "Elle s’appuie sur la maturité du quartz et de l’électronique des années 1980.",
      "next": "La connexion à une infrastructure externe annonce les objets synchronisés puis les smartwatches.",
      "note": ""
    },
    {
      "name": "Casio F-91W",
      "file": "Casio f91w digital watch.png",
      "period": "1989, icône des années 1990",
      "typical": "Ultra simple, légère, fiable et bon marché : la digitale devient un objet universel plutôt qu’un gadget futuriste.",
      "heritage": "Son LCD et son boîtier résine sont l’héritage direct des années 1980.",
      "next": "Sa logique fonctionnelle minimale cohabitera avec les montres sport plus massives des années 2000.",
      "note": ""
    }
  ],
  "2000": [
    {
      "name": "Seiko quartz",
      "file": "Seiko watch.jpg",
      "period": "achetée en 2004",
      "typical": "Montre quartz de ville très rationnelle : lisibilité, faible entretien et boîtier acier sans extravagance.",
      "heritage": "Elle prolonge la domination du quartz installée dans les années 1980-90.",
      "next": "La sobriété fonctionnelle annonce le retour à des designs plus simples et néo-vintage dans les années 2010.",
      "note": ""
    },
    {
      "name": "Festina",
      "file": "Festina watch.jpg",
      "period": "2006",
      "typical": "Montre sport/lifestyle à présence plus forte : bracelets métal, cadrans chargés et diamètre accru deviennent courants.",
      "heritage": "Le quartz sportif et les fonctions chronographe viennent des années 1990.",
      "next": "Le goût des montres imposantes prépare le pic des grandes tailles avant le retour progressif à des diamètres plus contenus.",
      "note": ""
    },
    {
      "name": "Casio G-Shock GW-056E",
      "file": "2006090201 Casio-G-shock.Mod.3017-GW-056E 2006.jpg",
      "period": "2006",
      "typical": "Résine, protection massive et fonctions électroniques : la robustesse devient un langage esthétique complet.",
      "heritage": "L’ADN G-Shock vient directement des années 1980 et de la montre digitale utilitaire.",
      "next": "La fonction connectée/solaire/radio-pilotée annonce les montres techniques intelligentes des années 2010.",
      "note": ""
    },
    {
      "name": "Fossil",
      "file": "Wristwatch on hand.JPG",
      "period": "2007",
      "typical": "Montre mode sur bracelet métal, boîtier généreux et présence visuelle forte : l’horlogerie devient un accessoire de style grand public.",
      "heritage": "Elle reprend la logique lifestyle des années 1990.",
      "next": "L’importance du design de marque prépare les collaborations, micro-marques et marketing communautaire des années 2010.",
      "note": ""
    },
    {
      "name": "BRM Birotor",
      "file": "BRM BIROTOR.jpg",
      "period": "2008",
      "typical": "Mécanique volontairement spectaculaire, construction visible et design industriel : le mouvement redevient un argument esthétique majeur.",
      "heritage": "Cela prolonge la renaissance mécanique amorcée dans les années 1990.",
      "next": "La mise en scène du mécanisme annonce la haute horlogerie contemporaine et les micro-marques techniques.",
      "note": ""
    },
    {
      "name": "Roman Watch",
      "file": "Roman Watch.jpg",
      "period": "2008",
      "typical": "Montre classique de ville, chiffres romains et cadran traditionnel : au milieu des montres XXL, le classicisme reste très présent.",
      "heritage": "Le vocabulaire reprend directement les dress watches historiques.",
      "next": "Cette continuité facilite le grand retour des codes vintage et des petits diamètres dans les années 2010.",
      "note": ""
    },
    {
      "name": "Casio titane",
      "file": "Ti covered watches.jpg",
      "period": "2006",
      "typical": "Titane, bracelet intégré et quartz : les matériaux techniques deviennent accessibles au quotidien.",
      "heritage": "Le quartz multifonction et le métal intégré viennent des années 1980-90.",
      "next": "La recherche de légèreté et de matériaux prépare les wearables et montres sport techniques des années 2010.",
      "note": ""
    },
    {
      "name": "Breitling Aerospace Avantage",
      "file": "Breitling Aerospace Avantage.jpg",
      "period": "années 2000",
      "typical": "Ana-digi, titane et fonctions professionnelles : la montre instrument devient plus grande et plus sophistiquée.",
      "heritage": "Elle hérite des ana-digi et quartz haut de gamme des années 1980-90.",
      "next": "La densité fonctionnelle annonce le terrain sur lequel les smartwatches entreront en concurrence.",
      "note": ""
    },
    {
      "name": "Omega Planet Ocean",
      "file": "Omega Seamaster Planet Ocean (16251735477).jpg",
      "period": "famille lancée en 2005",
      "typical": "Plongeuse très robuste, boîtier épais, lunette marquée et grande présence : l’esthétique tool watch est volontairement amplifiée.",
      "heritage": "Elle reprend les codes des plongeuses des années 1960-70.",
      "next": "La réinterprétation patrimoniale annonce la vague heritage et néo-vintage des années 2010.",
      "note": ""
    },
    {
      "name": "Tissot T-Touch",
      "file": "Tissot T-Touch.jpg",
      "period": "icône des années 2000",
      "typical": "Verre tactile, affichage analogique + digital et capteurs : la montre classique absorbe des interactions électroniques avancées.",
      "heritage": "Elle hérite des ana-digi et montres calculatrices des années 1980-90.",
      "next": "Le geste tactile et les capteurs annoncent directement les smartwatches de la décennie suivante.",
      "note": ""
    }
  ],
  "2010": [
    {
      "name": "Apple Watch",
      "file": "Apple Watch.jpg",
      "period": "2015",
      "typical": "Écran intégral, interface tactile, notifications et capteurs : la montre devient une extension du smartphone.",
      "heritage": "Elle reprend les idées de tactile, de synchronisation et de capteurs expérimentées depuis les années 1980-2000.",
      "next": "Elle ouvre une branche durable où logiciel, santé et services deviennent aussi importants que l’objet horloger.",
      "note": ""
    },
    {
      "name": "Pebble Time",
      "file": "Pebble Time front.jpg",
      "period": "2015",
      "typical": "Écran e-paper, notifications et autonomie pensée comme un compromis : la smartwatch cherche encore son langage propre.",
      "heritage": "Le boîtier rectangulaire et l’affichage digital rappellent les montres électroniques des années 1980.",
      "next": "Le principe d’écosystème d’applications annonce la maturité des plateformes connectées.",
      "note": ""
    },
    {
      "name": "Alcatel Smartwatch",
      "file": "Alcatel Smartwatch.jpg",
      "period": "2015",
      "typical": "Écran numérique dans une silhouette ronde : tentative de concilier montre traditionnelle et interface connectée.",
      "heritage": "La forme ronde hérite directement de l’horlogerie classique.",
      "next": "Cette hybridation devient un standard pour de nombreuses smartwatches contemporaines.",
      "note": ""
    },
    {
      "name": "Lenovo Smartwatch",
      "file": "LenovoWatch.jpg",
      "period": "2015",
      "typical": "Design de montre classique avec composant numérique : la décennie expérimente plusieurs façons de cacher la technologie.",
      "heritage": "Les proportions et le cadran s’inspirent des montres mécaniques traditionnelles.",
      "next": "L’intégration discrète de fonctions numériques annonce les hybrides connectées actuelles.",
      "note": ""
    },
    {
      "name": "Nomos Metro",
      "file": "Nomos Glashütte Metro.jpg",
      "period": "années 2010",
      "typical": "Petit diamètre relatif, cadran très aéré et minimalisme graphique : contrepoint net à la course aux grandes tailles des années 2000.",
      "heritage": "La pureté formelle reprend des codes du modernisme des années 1950-60.",
      "next": "Elle participe au retour durable vers des proportions plus contenues et des designs sobres.",
      "note": ""
    },
    {
      "name": "Nomos Tangente neomatik 41 Update",
      "file": "Nomos Glashütte Tangente neomatik 41 Update.jpg",
      "period": "fin des années 2010",
      "typical": "Mécanique fine, typographie minimaliste et complication intégrée discrètement : le mouvement traditionnel est présenté avec un design contemporain.",
      "heritage": "Le langage Bauhaus et la finesse renvoient aux montres habillées du milieu du XXe siècle.",
      "next": "Cette synthèse patrimoine + modernité devient un axe majeur des marques indépendantes et micro-marques.",
      "note": ""
    },
    {
      "name": "G-Shock moderne",
      "file": "G-Shock.jpg",
      "period": "années 2010",
      "typical": "La robustesse extrême reste assumée visuellement : gros volumes, protections et lecture digitale.",
      "heritage": "L’ADN est directement celui des premières G-Shock des années 1980.",
      "next": "L’ajout progressif de solaire, radio, Bluetooth et capteurs rapproche la tool watch de la smartwatch.",
      "note": ""
    },
    {
      "name": "Mondia Campus",
      "file": "Mondia Campus, anni 2010.jpg",
      "period": "années 2010",
      "typical": "Montre analogique simple, lisible et rétro : le vintage redevient une référence esthétique explicite.",
      "heritage": "Les index et proportions font écho aux montres de ville des années 1950-60.",
      "next": "Cette relecture historique annonce la multiplication des rééditions fidèles et des petites tailles dans les années 2020.",
      "note": ""
    },
    {
      "name": "Breil Manta quartz",
      "file": "Breil Manta al quarzo, metà anni 2010.jpg",
      "period": "milieu des années 2010",
      "typical": "Montre sport-lifestyle encore assez imposante : les années 2010 ne rompent pas immédiatement avec les volumes des années 2000.",
      "heritage": "Le boîtier massif et le quartz sportif prolongent les années 2000.",
      "next": "En parallèle, la tendance opposée vers des dimensions plus petites prépare la diversité actuelle du marché.",
      "note": ""
    },
    {
      "name": "Breitling Superocean II 36",
      "file": "Breitling Superocean II 36 - 2017.jpg",
      "period": "2017",
      "typical": "Plongeuse sportive dans un diamètre de 36 mm : exemple parlant du retour à des proportions plus mesurées sans abandonner les codes tool watch.",
      "heritage": "Lunette, étanchéité et lecture forte viennent des plongeuses des années 1960-70.",
      "next": "Le petit diamètre anticipe la normalisation actuelle des formats 36–39 mm, y compris sur des montres sportives.",
      "note": ""
    }
  ]
};

  const HISTORY_TIMELINE = [
    ['XVIe siècle', 'Les premières montres portatives à ressort apparaissent en Europe. Elles sont encore portées en pendentif ou dans la poche.'],
    ['1810', 'Breguet reçoit la commande documentée d’une montre conçue pour être portée au poignet pour Caroline Murat, reine de Naples.'],
    ['1868', 'Patek Philippe réalise une montre-bracelet suisse pour la comtesse Koscowicz : le bracelet est désormais pensé avec le boîtier.'],
    ['1904', 'Louis Cartier conçoit pour l’aviateur Alberto Santos-Dumont une montre permettant de lire l’heure sans lâcher les commandes : un jalon majeur de la montre-bracelet masculine.'],
    ['1914–1918', 'La Première Guerre mondiale accélère fortement l’usage de la montre au poignet chez les hommes : lire l’heure rapidement devient une nécessité opérationnelle.'],
    ['1926', 'Rolex présente l’Oyster, montre-bracelet étanche à l’eau et à la poussière grâce à un boîtier hermétique.'],
    ['1931', 'Le rotor Perpetual de Rolex popularise le remontage automatique à rotor libre, principe devenu central dans la montre automatique moderne.'],
    ['1940s', 'La lisibilité et la robustesse militaires influencent durablement la montre de terrain ; le civil reste dominé par les petites montres habillées.'],
    ['1950s', 'L’automatique se généralise, la date progresse et les grandes familles de montres-outils — plongée, exploration, aviation — prennent forme.'],
    ['1960s', 'Chronographes, plongeuses, alarmes et montres électriques se développent. Le 25 décembre 1969, Seiko commercialise l’Astron 35SQ, première montre-bracelet à quartz commercialisée.'],
    ['1970s', 'Quartz, LED et LCD transforment le marché. En 1973, Seiko commercialise une montre LCD à affichage continu six chiffres ; les formes deviennent beaucoup plus libres.'],
    ['1980s', 'Le quartz devient massif et accessible. Swatch naît en 1983 ; les digitales et les montres sport en résine deviennent des objets populaires.'],
    ['1990s', 'Le quartz reste roi du volume, mais la mécanique connaît un renouveau culturel et commercial, notamment dans le luxe et chez les collectionneurs.'],
    ['2000s', 'Les montres grossissent, la montre mécanique haut de gamme devient un marqueur de style, et le marché des sportives techniques explose.'],
    ['2010s–2020s', 'Smartwatches, micro-marques, ventes en ligne et réseaux sociaux élargissent l’univers. En parallèle, le vintage inspire un retour progressif aux formats plus contenus.']
  ];


  const newUuid = () => crypto.randomUUID();
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  function setSyncStatus(status, error='') {
    state.syncStatus = status;
    state.lastSyncError = error || '';
    if (!els.syncBadge) return;
    els.syncBadge.className = `sync-badge ${status}`;
    if (status === 'syncing') {
      els.syncBadge.innerHTML = '<span class="sync-progress">Sync</span>';
      els.syncBadge.title = 'Synchronisation en cours';
    } else if (status === 'synced') {
      els.syncBadge.textContent = 'Synchronisé';
      els.syncBadge.title = 'Bibliothèque synchronisée';
    } else if (status === 'error') {
      els.syncBadge.textContent = 'À synchroniser';
      els.syncBadge.title = error || 'Synchronisation incomplète';
    } else {
      els.syncBadge.textContent = 'Local';
      els.syncBadge.title = 'Données locales — connexion Folio inactive';
    }
  }

  async function stableUuid(namespace, value) {
    const source = `${namespace}:${String(value)}`;
    if (!crypto.subtle) return newUuid();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
    const b = digest.slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  async function normalizeLocalIds() {
    const folders = await WatchDB.getAll('folders');
    const watches = await WatchDB.getAll('watches');
    const needs = folders.some(f => !isUuid(f.id)) || watches.some(w => !isUuid(w.id));
    if (!needs) return false;

    const folderMap = new Map();
    for (const f of folders) folderMap.set(f.id, isUuid(f.id) ? f.id : await stableUuid('folio-folder', f.id));
    const itemMap = new Map();
    for (const w of watches) itemMap.set(w.id, isUuid(w.id) ? w.id : await stableUuid('folio-item', w.id));

    await WatchDB.clear('watches');
    await WatchDB.clear('folders');
    for (const f of folders) {
      await WatchDB.put('folders', {
        ...f,
        id: folderMap.get(f.id),
        pendingSync: true,
        updatedAt: Number(f.updatedAt) || Number(f.createdAt) || Date.now()
      });
    }
    for (const w of watches) {
      await WatchDB.put('watches', {
        ...w,
        id: itemMap.get(w.id),
        folderId: folderMap.get(w.folderId) || w.folderId,
        pendingSync: 'full',
        updatedAt: Number(w.updatedAt) || Number(w.createdAt) || Date.now()
      });
    }
    return true;
  }

  function defaultFolderNamesOnly() {
    if (state.watches.length) return false;
    if (!state.folders.length || state.folders.length > 4) return false;
    const allowed = new Set(['en vente', 'vendus', 'collection', 'reparation', 'reparations']);
    return state.folders.every(f => allowed.has(normalizeFolderName(f.name)));
  }

  async function enqueueDelete(kind, entityId) {
    await WatchDB.put('syncQueue', {
      id: newUuid(),
      kind,
      entityId,
      createdAt: Date.now()
    });
  }

  async function processDeleteQueue() {
    if (!FolioCloud.isSignedIn()) return;
    const jobs = (await WatchDB.getAll('syncQueue')).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const job of jobs) {
      if (job.kind === 'delete-item') await FolioCloud.deleteItem(job.entityId);
      if (job.kind === 'delete-folder') await FolioCloud.deleteFolder(job.entityId);
      await WatchDB.del('syncQueue', job.id);
    }
  }

  async function clearFolderPending(folderId) {
    const current = await WatchDB.get('folders', folderId);
    if (!current) return;
    await WatchDB.put('folders', { ...current, pendingSync: false });
  }

  async function clearItemPending(itemId) {
    const current = await WatchDB.get('watches', itemId);
    if (!current) return;
    await WatchDB.put('watches', { ...current, pendingSync: false });
  }

  async function saveLocalSettings({ miscExpenses = state.miscExpenses, updatedAt = Date.now(), pendingSync = true } = {}) {
    const next = {
      id: 'main',
      miscExpenses: Math.max(0, Number(miscExpenses) || 0),
      updatedAt: Number(updatedAt) || Date.now(),
      pendingSync: !!pendingSync
    };
    await WatchDB.put('settings', next);
    state.miscExpenses = next.miscExpenses;
    state.miscExpensesUpdatedAt = next.updatedAt;
    state.miscExpensesPendingSync = next.pendingSync;
    return next;
  }

  async function clearSettingsPending() {
    const current = await WatchDB.get('settings', 'main');
    if (!current) return;
    await WatchDB.put('settings', { ...current, pendingSync: false });
    state.miscExpensesPendingSync = false;
  }

  async function syncSettingsRecord(settings, { quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      await FolioCloud.upsertSettings(settings);
      await clearSettingsPending();
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Frais divers enregistrés localement · synchronisation en attente');
      return false;
    }
  }

  async function syncFolderRecord(folder, { quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      await FolioCloud.upsertFolder(folder);
      await clearFolderPending(folder.id);
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Enregistré localement · synchronisation en attente');
      return false;
    }
  }

  async function syncItemRecord(item, { full=true, quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      const folder = item.folderId ? await WatchDB.get('folders', item.folderId) : null;
      if (folder?.pendingSync) {
        await FolioCloud.upsertFolder(folder);
        await clearFolderPending(folder.id);
      }
      if (full) await FolioCloud.saveItemWithPhotos(item);
      else await FolioCloud.upsertItem(item);
      await clearItemPending(item.id);
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Enregistré localement · synchronisation en attente');
      return false;
    }
  }

  async function markAllPendingFull() {
    const folders = await WatchDB.getAll('folders');
    const watches = await WatchDB.getAll('watches');
    for (const f of folders) await WatchDB.put('folders', { ...f, pendingSync: true });
    for (const w of watches) await WatchDB.put('watches', { ...w, pendingSync: 'full' });
    const settings = await WatchDB.get('settings', 'main');
    if (settings) await WatchDB.put('settings', { ...settings, pendingSync: true });
  }


  async function reconcileLocalFoldersWithRemote(remote) {
    if (!remote?.folders?.length) return;
    const localFolders = await WatchDB.getAll('folders');
    const localWatches = await WatchDB.getAll('watches');
    const remoteById = new Map(remote.folders.map(f => [f.id, f]));
    const remoteByName = new Map(remote.folders.map(f => [String(f.name || '').trim().toLocaleLowerCase('fr'), f]));
    let changed = false;

    for (const local of localFolders) {
      if (remoteById.has(local.id)) continue;
      const match = remoteByName.get(String(local.name || '').trim().toLocaleLowerCase('fr'));
      if (!match) continue;

      for (const w of localWatches.filter(x => x.folderId === local.id)) {
        await WatchDB.put('watches', {
          ...w,
          folderId: match.id,
          updatedAt: Date.now(),
          pendingSync: w.pendingSync === 'full' ? 'full' : 'meta'
        });
      }
      await WatchDB.del('folders', local.id);
      const existingRemoteFolder = await WatchDB.get('folders', match.id);
      if (!existingRemoteFolder) {
        await WatchDB.put('folders', {
          id: match.id,
          name: match.name || local.name,
          order: Number(match.sort_order) || 0,
          includeInTotals: match.include_in_totals !== false,
          createdAt: remoteTime(match.created_at),
          updatedAt: remoteTime(match.updated_at),
          pendingSync: false
        });
      }
      changed = true;
    }
    if (changed) await loadData();
  }

  async function pushPending() {
    const folders = await WatchDB.getAll('folders');
    for (const f of folders.filter(x => x.pendingSync)) {
      await FolioCloud.upsertFolder(f);
      await clearFolderPending(f.id);
    }
    const watches = await WatchDB.getAll('watches');
    for (const w of watches.filter(x => x.pendingSync)) {
      if (w.pendingSync === 'meta') await FolioCloud.upsertItem(w);
      else await FolioCloud.saveItemWithPhotos(w);
      await clearItemPending(w.id);
    }
    const settings = await WatchDB.get('settings', 'main');
    if (settings?.pendingSync) {
      await FolioCloud.upsertSettings(settings);
      await clearSettingsPending();
    }
  }

  function remoteTime(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : Date.now();
  }

  async function mapWithConcurrency(list, limit, fn) {
    const out = new Array(list.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= list.length) break;
        out[i] = await fn(list[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  }

  async function applyRemoteLibrary(remote) {
    const existing = new Map((await WatchDB.getAll('watches')).map(w => [w.id, w]));
    const photosByItem = new Map();
    for (const row of remote.photos || []) {
      if (!photosByItem.has(row.item_id)) photosByItem.set(row.item_id, []);
      photosByItem.get(row.item_id).push(row);
    }
    for (const rows of photosByItem.values()) rows.sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));

    const localItems = await mapWithConcurrency(remote.items || [], 4, async row => {
      const rows = photosByItem.get(row.id) || [];
      const old = existing.get(row.id);
      const updatedAt = remoteTime(row.updated_at);
      let photos = null;
      if (old && !old.pendingSync && Math.abs((Number(old.updatedAt) || 0) - updatedAt) < 1000 && (old.photos || []).length === rows.length) {
        photos = old.photos || [];
      } else {
        try {
          photos = await mapWithConcurrency(rows, 4, r => FolioCloud.downloadPhoto(r.storage_path));
        } catch (err) {
          console.warn('Folio: certaines photos n’ont pas pu être téléchargées', err);
          photos = old?.photos || [];
        }
      }
      return {
        id: row.id,
        folderId: row.folder_id,
        name: row.name || '',
        listingTitle: row.listing_title || '',
        askingPrice: row.asking_price === null || row.asking_price === undefined ? null : Number(row.asking_price),
        description: row.description || '',
        buyPrice: row.purchase_price === null ? null : Number(row.purchase_price),
        sellPrice: row.sale_price === null ? null : Number(row.sale_price),
        fees: row.fees === null ? 0 : Number(row.fees),
        order: Number(row.sort_order) || 0,
        photos,
        createdAt: remoteTime(row.created_at),
        updatedAt,
        pendingSync: false
      };
    });

    const localFolders = (remote.folders || []).map(row => ({
      id: row.id,
      name: row.name || '',
      order: Number(row.sort_order) || 0,
      includeInTotals: row.include_in_totals !== false,
      createdAt: remoteTime(row.created_at),
      updatedAt: remoteTime(row.updated_at),
      pendingSync: false
    }));

    await WatchDB.clear('watches');
    await WatchDB.clear('folders');
    for (const f of localFolders) await WatchDB.put('folders', f);
    for (const w of localItems) await WatchDB.put('watches', w);
    if (remote.settings) {
      await WatchDB.put('settings', {
        id: 'main',
        miscExpenses: Number(remote.settings.misc_expenses) || 0,
        updatedAt: remoteTime(remote.settings.updated_at),
        pendingSync: false
      });
    }
    await loadData();
  }

  async function syncNow({ silent=false } = {}) {
    if (!FolioCloud.isSignedIn()) {
      setSyncStatus('local');
      if (!silent) showLoginSheet();
      return false;
    }
    if (state.syncBusy) return false;
    state.syncBusy = true;
    setSyncStatus('syncing');
    try {
      await normalizeLocalIds();
      await loadData();
      await processDeleteQueue();

      let remote = await FolioCloud.fetchLibrary();
      const remoteHasData = (remote.folders?.length || 0) + (remote.items?.length || 0) > 0;
      if (remoteHasData) await reconcileLocalFoldersWithRemote(remote);

      if (remoteHasData && defaultFolderNamesOnly()) {
        // Sur un nouvel appareil, ne pousse pas trois dossiers locaux vides devant une bibliothèque existante.
        await applyRemoteLibrary(remote);
      } else {
        if (!remoteHasData) await markAllPendingFull();
        await pushPending();
        remote = await FolioCloud.fetchLibrary();
        if ((remote.folders?.length || 0) + (remote.items?.length || 0) > 0) await applyRemoteLibrary(remote);
      }

      if (!state.folders.length) {
        await initDefaults();
        await loadData();
        await pushPending();
      }

      // Les bibliothèques créées avant V6.4 reçoivent automatiquement le dossier Réparation.
      await ensureRepairFolder({ sync:true });
      await loadData();

      setSyncStatus('synced');
      render();
      if (!silent) toast('Folio synchronisé');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!silent) alert(`Synchronisation impossible : ${err.message}`);
      return false;
    } finally {
      state.syncBusy = false;
    }
  }

  function showLoginSheet() {
    openSheet(`
      <h2 class="sheet-title">Connexion Folio</h2>
      <form id="loginForm" class="form">
        <div class="login-note">Connecte ton Mac et ton téléphone avec le même compte pour retrouver automatiquement la même bibliothèque.</div>
        <div class="field"><label>Adresse e-mail</label><input id="loginEmail" type="email" autocomplete="username" required></div>
        <div class="field"><label>Mot de passe</label><input id="loginPassword" type="password" autocomplete="current-password" required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Plus tard</button><button class="btn primary">Se connecter</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('.btn.primary');
      button.disabled = true;
      button.textContent = 'Connexion…';
      try {
        const email = els.sheetContent.querySelector('#loginEmail').value.trim();
        const password = els.sheetContent.querySelector('#loginPassword').value;
        await FolioCloud.signIn(email, password);
        closeSheet();
        await syncNow({ silent:false });
      } catch (err) {
        console.error(err);
        alert(`Connexion impossible : ${err.message}`);
        button.disabled = false;
        button.textContent = 'Se connecter';
      }
    });
  }

  function showSyncMenu() {
    if (!FolioCloud.isSignedIn()) return showLoginSheet();
    const user = FolioCloud.getUser();
    openSheet(`
      <h2 class="sheet-title">Synchronisation</h2>
      <div class="account-card">Compte Folio :<br><strong>${esc(user?.email || 'Utilisateur connecté')}</strong></div>
      <div class="sheet-list" style="margin-top:10px;">
        <button class="sheet-action" data-sync="now"><strong>Synchroniser maintenant</strong><small>Récupère les changements faits sur tes autres appareils.</small></button>
        <button class="sheet-action" data-sync="logout"><strong>Se déconnecter</strong><small>Les données déjà téléchargées restent disponibles localement sur cet appareil.</small></button>
      </div>`);
    els.sheetContent.querySelector('[data-sync="now"]').addEventListener('click', async () => { closeSheet(); await syncNow({ silent:false }); });
    els.sheetContent.querySelector('[data-sync="logout"]').addEventListener('click', async () => {
      await FolioCloud.signOut();
      closeSheet();
      setSyncStatus('local');
      toast('Synchronisation déconnectée');
    });
  }

  async function syncImportedLibrary() {
    if (!FolioCloud.isSignedIn()) return;
    await normalizeLocalIds();
    await markAllPendingFull();
    await loadData();
    syncNow({ silent:true });
  }

  function cleanupObjectUrls() {
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
    state.objectUrls.clear();
  }

  function blobUrl(blob) {
    if (!(blob instanceof Blob)) return null;
    const url = URL.createObjectURL(blob);
    state.objectUrls.add(url);
    return url;
  }

  function watchProfit(w) {
    const sell = num(w.sellPrice);
    // Dans Réparation, le coût est une dépense réelle même avant facturation :
    // une réparation à 12 € de coût et sans prix renseigné vaut donc -12 €.
    if (isRepairItem(w)) return (sell || 0) - (num(w.buyPrice) || 0) - (num(w.fees) || 0);
    if (sell === null) return null;
    return sell - (num(w.buyPrice) || 0) - (num(w.fees) || 0);
  }

  function totals(watches) {
    let buy = 0, sell = 0, fees = 0, profit = 0;
    for (const w of watches) {
      buy += num(w.buyPrice) || 0;
      fees += num(w.fees) || 0;
      if (num(w.sellPrice) !== null) sell += num(w.sellPrice) || 0;
      const p = watchProfit(w);
      if (p !== null) profit += p;
    }
    return { buy, sell, fees, profit };
  }

  function folderIncludedInTotals(folder) {
    return !folder || folder.includeInTotals !== false;
  }

  function watchesIncludedInGeneralTotals() {
    const folderById = new Map(state.folders.map(f => [f.id, f]));
    return state.watches.filter(w => folderIncludedInTotals(folderById.get(w.folderId)));
  }

  function profitClass(value) {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return '';
  }

  function summaryHtml(t, title='Total général', labels={ buy:'Achat', sell:'Vente', profit:'Bénéfice' }) {
    return `
      <section class="summary">
        <div class="summary-title">${esc(title)}</div>
        <div class="summary-grid">
          <div class="metric"><div class="metric-label">${esc(labels.buy)}</div><div class="metric-value">${euro(t.buy)}</div></div>
          <div class="metric"><div class="metric-label">${esc(labels.sell)}</div><div class="metric-value">${euro(t.sell)}</div></div>
          <div class="metric"><div class="metric-label">${esc(labels.profit)}</div><div class="metric-value ${profitClass(t.profit)}">${euro(t.profit)}</div></div>
        </div>
      </section>`;
  }

  function homeSummaryHtml(t) {
    const misc = Number(state.miscExpenses) || 0;
    const treasury = t.sell - t.buy - t.fees - misc;
    return `
      <section class="summary home-summary">
        <div class="summary-title">Total général</div>
        <div class="summary-grid summary-grid-home-primary">
          <div class="metric"><div class="metric-label">Achat</div><div class="metric-value">${euro(t.buy)}</div></div>
          <div class="metric"><div class="metric-label">Recette</div><div class="metric-value">${euro(t.sell)}</div></div>
          <div class="metric"><div class="metric-label">Bénéfice</div><div class="metric-value ${profitClass(t.profit)}">${euro(t.profit)}</div></div>
        </div>
        <div class="home-secondary-row">
          <div class="secondary-metric misc-expense-block">
            <label class="secondary-label" for="miscExpensesInput">Frais divers</label>
            <div class="misc-expense-input-wrap">
              <input id="miscExpensesInput" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(String(misc))}" aria-label="Frais divers">
              <span>€</span>
            </div>
          </div>
          <div class="secondary-metric treasury-block">
            <div class="secondary-label">Trésorerie</div>
            <div class="secondary-value ${profitClass(treasury)}">${euro(treasury)}</div>
          </div>
        </div>
        <div class="treasury-hint">Trésorerie = recettes − achats − frais des fiches − frais divers</div>
      </section>`;
  }

  async function initDefaults() {
    const folders = await WatchDB.getAll('folders');
    if (folders.length) return;
    const now = Date.now();
    const defaults = ['En vente', 'Vendus', 'Collection', 'Réparation'];
    for (let i = 0; i < defaults.length; i++) {
      await WatchDB.put('folders', {
        id: newUuid(),
        name: defaults[i],
        order: i,
        includeInTotals: true,
        createdAt: now + i,
        updatedAt: now + i,
        pendingSync: true
      });
    }
  }

  async function ensureRepairFolder({ sync=true } = {}) {
    const folders = await WatchDB.getAll('folders');
    const existing = folders.find(isRepairFolder);
    if (existing) return existing;

    const now = Date.now();
    const folder = {
      id: newUuid(),
      name: 'Réparation',
      order: folders.length,
      includeInTotals: true,
      createdAt: now,
      updatedAt: now,
      pendingSync: true
    };
    await WatchDB.put('folders', folder);
    if (sync && FolioCloud.isSignedIn()) await syncFolderRecord(folder, { quiet:true });
    return folder;
  }

  async function loadData() {
    state.folders = (await WatchDB.getAll('folders')).sort((a,b) => a.createdAt - b.createdAt);
    state.watches = (await WatchDB.getAll('watches')).sort((a,b) => b.createdAt - a.createdAt);
    const settings = await WatchDB.get('settings', 'main');
    state.miscExpenses = Number(settings?.miscExpenses) || 0;
    state.miscExpensesUpdatedAt = Number(settings?.updatedAt) || 0;
    state.miscExpensesPendingSync = !!settings?.pendingSync;
  }

  function folderWatches(folderId) {
    return state.watches
      .filter(w => w.folderId === folderId)
      .sort((a, b) => {
        const ao = Number(a.order);
        const bo = Number(b.order);
        const ah = Number.isFinite(ao);
        const bh = Number.isFinite(bo);
        if (ah && bh && ao !== bo) return ao - bo;
        if (ah !== bh) return ah ? -1 : 1;
        return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      });
  }

  function topOrderForFolder(folderId, excludeId = null) {
    const orders = state.watches
      .filter(w => w.folderId === folderId && w.id !== excludeId)
      .map(w => Number(w.order))
      .filter(Number.isFinite);
    return orders.length ? Math.min(...orders) - 1 : -1;
  }

  function setView(type, id=null) {
    closeSheet();
    state.view = { type, id };
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function render() {
    cleanupObjectUrls();
    const { type, id } = state.view;
    els.backBtn.classList.toggle('hidden', type === 'home');
    els.fab.classList.remove('hidden');

    if (type === 'home') return renderHome();
    if (type === 'folder') return renderFolder(id);
    if (type === 'watch') return renderWatch(id);
    if (type === 'history') return renderHistory();
    if (type === 'history-era') return renderHistoryEraDetail(id);
  }

  function renderHome() {
    els.subtitle.textContent = `${state.watches.length} objet${state.watches.length > 1 ? 's' : ''}`;
    els.fab.setAttribute('aria-label', 'Ajouter un objet');
    const t = totals(watchesIncludedInGeneralTotals());
    let html = homeSummaryHtml(t);
    html += `<div class="section-head"><div class="section-title">Dossiers</div><button class="text-btn" data-action="new-folder">＋ Nouveau</button></div>`;

    if (!state.folders.length) {
      html += `<div class="empty"><span class="big">⌁</span>Aucun dossier pour le moment.</div>`;
    } else {
      html += `<div class="folder-grid">`;
      for (const f of state.folders) {
        const fw = state.watches.filter(w => w.folderId === f.id);
        const ft = totals(fw);
        const repair = isRepairFolder(f);
        html += `
          <div class="folder-card ${f.includeInTotals === false ? 'excluded-from-totals' : ''} ${repair ? 'repair-folder-card' : ''}">
            <button class="folder-card-open" data-folder-id="${f.id}">
              <div class="folder-top"><div class="folder-name">${esc(f.name)}</div><div class="folder-count">${fw.length}</div></div>
              <div class="folder-stats">
                <div class="stat-row"><span>${repair ? 'Coût' : 'Achat'}</span><strong>${euro(ft.buy)}</strong></div>
                <div class="stat-row"><span>${repair ? 'Réparations' : 'Vente'}</span><strong>${euro(ft.sell)}</strong></div>
                <div class="stat-row"><span>Bénéfice</span><strong class="${profitClass(ft.profit)}">${euro(ft.profit)}</strong></div>
              </div>
            </button>
            <label class="folder-total-toggle">
              <input type="checkbox" data-folder-total-toggle="${f.id}" ${f.includeInTotals === false ? '' : 'checked'}>
              <span>Inclure dans les totaux</span>
            </label>
          </div>`;
      }
      html += `</div>`;
    }

    html += `
      <section class="history-entry-wrap">
        <button class="history-entry" data-action="open-history">
          <div class="history-entry-icon">⌚</div>
          <div class="history-entry-copy">
            <strong>Histoire</strong>
            <span>Repères, grandes époques, innovations et styles de montres.</span>
          </div>
          <div class="history-entry-arrow">›</div>
        </button>
      </section>`;

    els.main.innerHTML = html;
    bindCommon();
  }

  function historyEraCard(era) {
    return `
      <article id="era-${era.key}" class="history-era-card">
        <div class="history-era-photo-wrap">
          <img class="history-era-photo" src="${era.image}" alt="${esc(era.photoLabel)}" loading="lazy" referrerpolicy="no-referrer">
          <div class="history-era-photo-fallback" aria-hidden="true">⌚</div>
        </div>
        <div class="history-era-content">
          <div class="history-era-kicker">${esc(era.label)}</div>
          <h2>${esc(era.title)}</h2>
          <p>${esc(era.intro)}</p>
          <div class="history-subtitle">À reconnaître</div>
          <div class="history-tags">${era.recognize.map(x => `<span>${esc(x)}</span>`).join('')}</div>
          <div class="history-subtitle">Exemples repères</div>
          <div class="history-examples">${era.examples.map(x => `<span>• ${esc(x)}</span>`).join('')}</div>
          <button class="history-more-btn" data-history-more="${era.key}">En savoir plus <span>›</span></button>
          <a class="history-credit" href="${era.source}" target="_blank" rel="noopener noreferrer">Photo : ${esc(era.credit)} · Wikimedia Commons ↗</a>
        </div>
      </article>`;
  }

  function historyDetailCard(item, index) {
    const source = commonsSource(item.file);
    return `
      <article class="history-detail-card">
        <div class="history-detail-image-wrap">
          <img class="history-detail-image" src="${commonsFile(item.file)}" alt="${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer">
          <div class="history-detail-image-fallback" aria-hidden="true">⌚</div>
          <span class="history-detail-number">${String(index + 1).padStart(2,'0')}</span>
        </div>
        <div class="history-detail-copy">
          <div class="history-detail-period">${esc(item.period || '')}</div>
          <h2>${esc(item.name)}</h2>
          ${item.note ? `<p class="history-detail-note">${esc(item.note)}</p>` : ''}
          <div class="history-analysis-block">
            <div class="history-analysis-label">Typique de l’époque</div>
            <p>${esc(item.typical)}</p>
          </div>
          <div class="history-analysis-block previous">
            <div class="history-analysis-label">Héritage de l’époque précédente</div>
            <p>${esc(item.heritage)}</p>
          </div>
          <div class="history-analysis-block next">
            <div class="history-analysis-label">Ce qui annonce la suite</div>
            <p>${esc(item.next)}</p>
          </div>
          <a class="history-credit" href="${source}" target="_blank" rel="noopener noreferrer">Source photo · Wikimedia Commons ↗</a>
        </div>
      </article>`;
  }

  function renderHistoryEraDetail(eraKey) {
    const era = HISTORY_ERAS.find(x => x.key === eraKey);
    if (!era) return setView('history');
    const items = HISTORY_ERA_DETAILS[eraKey] || [];
    els.subtitle.textContent = `Histoire · ${era.label}`;
    els.fab.classList.add('hidden');
    els.main.innerHTML = `
      <section class="history-detail-hero">
        <div class="history-eyebrow">FOLIO · HISTOIRE · ${esc(era.label)}</div>
        <h1>${esc(era.title)}</h1>
        <p>${esc(era.intro)}</p>
        <div class="history-tags">${era.recognize.map(x => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="history-detail-count">${items.length} montres à observer</div>
      </section>
      <section class="history-detail-grid">
        ${items.map(historyDetailCard).join('')}
      </section>
      <section class="history-sources history-detail-sources">
        <strong>Comment lire ces exemples</strong>
        <p>Chaque montre est utilisée comme repère visuel : certains modèles sont datés précisément, d’autres représentent une famille de design dont les codes se prolongent sur plusieurs années. L’analyse distingue volontairement ce qui appartient à la décennie, ce qui vient de la précédente et ce qui prépare la suivante.</p>
        <p class="history-online-note">Les photographies sont chargées depuis Wikimedia Commons et peuvent nécessiter une connexion Internet.</p>
      </section>`;
    bindCommon();
    document.querySelectorAll('.history-detail-image').forEach(img => {
      img.addEventListener('error', () => img.classList.add('image-error'));
    });
  }

  function renderHistory() {
    els.subtitle.textContent = 'Histoire de l’horlogerie';
    els.fab.classList.add('hidden');
    const eraNav = HISTORY_ERAS.map(era => `
      <button class="history-era-pill" data-era-target="${era.key}">
        <span class="history-pill-image"><img src="${era.image}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>
        <span>${esc(era.label)}</span>
      </button>`).join('');

    const timeline = HISTORY_TIMELINE.map(([date, text]) => `
      <div class="history-timeline-row">
        <div class="history-timeline-date">${esc(date)}</div>
        <div class="history-timeline-dot" aria-hidden="true"></div>
        <div class="history-timeline-text">${esc(text)}</div>
      </div>`).join('');

    els.main.innerHTML = `
      <section class="history-intro">
        <div class="history-eyebrow">FOLIO · HISTOIRE</div>
        <h1>Une petite histoire de la montre</h1>
        <p>Des premières montres portatives au quartz, puis aux montres connectées : des repères simples pour situer un style, une technologie et une époque. Les frontières entre décennies restent naturellement progressives.</p>
      </section>

      <section class="history-era-nav-wrap">
        <div class="history-nav-title">Grandes époques</div>
        <div class="history-era-nav">${eraNav}</div>
      </section>

      <section class="history-era-list">
        ${HISTORY_ERAS.map(historyEraCard).join('')}
      </section>

      <section class="history-timeline-section">
        <div class="history-section-head">
          <div class="history-eyebrow">REPÈRES</div>
          <h2>De l’invention aux grands courants</h2>
        </div>
        <div class="history-timeline">${timeline}</div>
      </section>

      <section class="history-sources">
        <strong>Sources historiques principales</strong>
        <p>Breguet (1810), Patek Philippe (1868), Cartier (1904), Rolex (Oyster 1926 / rotor Perpetual 1931), Seiko (Astron 1969 / LCD 1973) et Swatch Group (Swatch 1983). Les photographies d’époque illustratives proviennent de Wikimedia Commons sous les licences indiquées.</p>
        <p class="history-online-note">Les images d’exemple sont chargées depuis Wikimedia Commons lorsqu’une connexion Internet est disponible.</p>
      </section>`;

    bindCommon();
    document.querySelectorAll('[data-era-target]').forEach(btn => btn.addEventListener('click', () => {
      document.getElementById(`era-${btn.dataset.eraTarget}`)?.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
    document.querySelectorAll('[data-history-more]').forEach(btn => btn.addEventListener('click', () => setView('history-era', btn.dataset.historyMore)));
    document.querySelectorAll('.history-era-photo, .history-pill-image img').forEach(img => {
      img.addEventListener('error', () => img.classList.add('image-error'));
    });
  }

  function renderFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return setView('home');
    const watches = folderWatches(folderId);
    const repair = isRepairFolder(folder);
    els.subtitle.textContent = folder.name;
    els.fab.setAttribute('aria-label', repair ? 'Ajouter une réparation' : 'Ajouter un objet');
    const t = totals(watches);
    let html = repair
      ? summaryHtml(t, folder.name, { buy:'Coût', sell:'Réparations', profit:'Bénéfice' })
      : summaryHtml(t, folder.name);
    html += `<div class="section-head"><div class="section-title">${watches.length} ${repair ? `réparation${watches.length > 1 ? 's' : ''}` : `objet${watches.length > 1 ? 's' : ''}`}</div><button class="text-btn" data-action="folder-menu">Gérer</button></div>`;
    if (!watches.length) {
      html += repair
        ? `<div class="empty"><span class="big">🔧</span>Aucune réparation pour le moment.<br>Appuie sur ＋ pour en ajouter une.</div>`
        : `<div class="empty"><span class="big">⌚</span>Aucun objet dans ce dossier.<br>Appuie sur ＋ pour en ajouter un.</div>`;
    } else {
      html += `<div class="watch-order-hint">Glisse ${repair ? 'une ligne' : 'un objet'} pour changer sa place. Sur téléphone : appui prolongé puis déplace-${repair ? 'la' : 'le'}.</div>`;
      html += `<div class="watch-grid ${repair ? 'repair-list' : ''}" data-watch-grid>${watches.map(w => repair ? repairCardHtml(w) : watchCardHtml(w)).join('')}</div>`;
    }
    els.main.innerHTML = html;
    bindCommon();
    bindWatchSorting(folderId);
  }

  function repairCardHtml(w) {
    const p = watchProfit(w);
    return `
      <div class="watch-card repair-row" data-watch-id="${w.id}" draggable="true" role="button" tabindex="0" aria-label="Ouvrir ${esc(w.name || 'Sans nom')}">
        <div class="watch-drag-handle" aria-hidden="true">≡</div>
        <div class="repair-row-name">${esc(w.name || 'Sans nom')}</div>
        <div class="repair-row-money">
          <div><span>Coût</span><strong>${euro(num(w.buyPrice) || 0)}</strong></div>
          <div><span>Réparation</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
          <div><span>Bénéf.</span><strong class="${profitClass(p)}">${euro(p)}</strong></div>
        </div>
      </div>`;
  }

  function watchCardHtml(w) {
    const p = watchProfit(w);
    const first = Array.isArray(w.photos) && w.photos.length ? w.photos[0] : null;
    const photo = first ? `<img class="watch-photo" src="${blobUrl(first)}" alt="${esc(w.name)}">` : `<div class="photo-placeholder">⌚</div>`;
    return `
      <div class="watch-card" data-watch-id="${w.id}" draggable="true" role="button" tabindex="0" aria-label="Ouvrir ${esc(w.name || 'Sans nom')}">
        <div class="watch-drag-handle" aria-hidden="true">≡</div>
        ${photo}
        <div class="watch-body">
          <div class="watch-name">${esc(w.name || 'Sans nom')}</div>
          <div class="watch-money">
            <div><span>Achat</span><strong>${euro(w.buyPrice)}</strong></div>
            <div><span>Vente</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
            <div><span>Bénéf.</span><strong class="${p === null ? '' : profitClass(p)}">${p === null ? '—' : euro(p)}</strong></div>
          </div>
        </div>
      </div>`;
  }

  async function persistWatchOrder(folderId, orderedIds) {
    const now = Date.now();
    const byId = new Map(state.watches.filter(w => w.folderId === folderId).map(w => [w.id, w]));
    const changed = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const w = byId.get(orderedIds[i]);
      if (!w) continue;
      const next = { ...w, order: i, updatedAt: now + i, pendingSync: 'meta' };
      await WatchDB.put('watches', next);
      changed.push(next);
    }
    await loadData();
    if (FolioCloud.isSignedIn()) {
      for (const w of changed) await syncItemRecord(w, { full:false, quiet:true });
      await loadData();
    }
  }

  async function moveWatchInFolder(folderId, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const ids = folderWatches(folderId).map(w => w.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    await persistWatchOrder(folderId, ids);
  }

  function bindWatchSorting(folderId) {
    const root = document.querySelector('[data-watch-grid]');
    if (!root) return;
    let draggedId = null;

    root.querySelectorAll('.watch-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedId = card.dataset.watchId;
        state.suppressWatchClickUntil = Date.now() + 600;
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', draggedId); } catch (_) {}
        }
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        if (draggedId && draggedId !== card.dataset.watchId) card.classList.add('drag-target');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-target'));
      card.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        const fromId = draggedId || e.dataTransfer?.getData('text/plain');
        const toId = card.dataset.watchId;
        state.suppressWatchClickUntil = Date.now() + 700;
        await moveWatchInFolder(folderId, fromId, toId);
        renderFolder(folderId);
        toast('Ordre enregistré');
      });
      card.addEventListener('dragend', () => {
        draggedId = null;
        root.querySelectorAll('.watch-card').forEach(el => el.classList.remove('is-dragging','drag-target'));
      });
    });

    let pressTimer = null;
    let sortingCard = null;
    let pointerId = null;
    let orderChanged = false;

    const stopSort = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      sortingCard?.classList.remove('is-touch-sorting');
      sortingCard = null;
      pointerId = null;
      root.classList.remove('is-sorting');
    };

    root.querySelectorAll('.watch-card').forEach(card => {
      card.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        pointerId = e.pointerId;
        orderChanged = false;
        pressTimer = setTimeout(() => {
          sortingCard = card;
          sortingCard.classList.add('is-touch-sorting');
          root.classList.add('is-sorting');
          state.suppressWatchClickUntil = Date.now() + 1200;
          try { card.setPointerCapture(pointerId); } catch (_) {}
          if (navigator.vibrate) navigator.vibrate(20);
        }, 300);
      });

      card.addEventListener('pointermove', e => {
        if (!sortingCard || e.pointerId !== pointerId) return;
        e.preventDefault();
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.watch-card');
        if (!target || !root.contains(target) || target === sortingCard) return;
        const cards = [...root.querySelectorAll('.watch-card')];
        const from = cards.indexOf(sortingCard);
        const to = cards.indexOf(target);
        if (from < 0 || to < 0) return;
        if (from < to) target.after(sortingCard);
        else target.before(sortingCard);
        orderChanged = true;
      });

      ['pointerup','pointercancel'].forEach(type => card.addEventListener(type, async e => {
        if (e.pointerId !== pointerId) return;
        const changed = orderChanged && !!sortingCard;
        const ids = changed ? [...root.querySelectorAll('.watch-card')].map(el => el.dataset.watchId) : [];
        if (!sortingCard) clearTimeout(pressTimer);
        stopSort();
        if (changed) {
          state.suppressWatchClickUntil = Date.now() + 800;
          await persistWatchOrder(folderId, ids);
          renderFolder(folderId);
          toast('Ordre enregistré');
        }
      }));
    });
  }

  function renderWatch(watchId) {
    const w = state.watches.find(x => x.id === watchId);
    if (!w) return setView('home');
    const folder = state.folders.find(f => f.id === w.folderId);
    const repair = isRepairFolder(folder);
    els.subtitle.textContent = folder?.name || 'Objet';
    els.fab.classList.add('hidden');
    const p = watchProfit(w);
    let html = '';

    if (!repair) {
      const photos = Array.isArray(w.photos) ? w.photos : [];
      const urls = photos.map(blobUrl);
      if (urls.length) {
        html += `<div class="detail-hero"><img id="heroPhoto" src="${urls[0]}" alt="${esc(w.name)}"></div>`;
        if (urls.length > 1) {
          html += `<div class="photo-strip">${urls.map((u,i)=>`<img class="thumb ${i===0?'active':''}" data-photo-index="${i}" src="${u}" alt="Photo ${i+1}">`).join('')}</div>`;
        }
      } else {
        html += `<div class="detail-hero"><div class="photo-placeholder">⌚</div></div>`;
      }

      html += `
        <h1 class="detail-title">${esc(w.name || 'Sans nom')}</h1>
        <div class="detail-folder">${esc(folder?.name || 'Sans dossier')}</div>
        ${(w.listingTitle || num(w.askingPrice) !== null) ? `<div class="detail-folder"><strong>Annonce :</strong> ${w.listingTitle ? esc(w.listingTitle) : '—'}${num(w.askingPrice) !== null ? ` · <strong>Prix demandé :</strong> ${euro(w.askingPrice)}` : ''}</div>` : ''}
        <div class="detail-stats">
          <div class="detail-stat"><span>Achat</span><strong>${euro(w.buyPrice)}</strong></div>
          <div class="detail-stat"><span>Vente</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
          <div class="detail-stat"><span>Bénéfice</span><strong class="${p === null ? '' : profitClass(p)}">${p === null ? '—' : euro(p)}</strong></div>
        </div>
        ${num(w.fees) ? `<div class="detail-folder">Frais inclus dans le calcul : ${euro(w.fees)}</div>` : ''}
        ${w.description ? `<div class="detail-description">${esc(w.description)}</div>` : ''}`;

      setTimeout(() => {
        document.querySelectorAll('.thumb').forEach((el, i) => {
          el.addEventListener('click', () => {
            const hero = document.getElementById('heroPhoto');
            if (hero) hero.src = urls[i];
            document.querySelectorAll('.thumb').forEach(x => x.classList.remove('active'));
            el.classList.add('active');
          });
        });
      }, 0);
    } else {
      html += `
        <div class="repair-detail-icon">🔧</div>
        <h1 class="detail-title">${esc(w.name || 'Sans nom')}</h1>
        <div class="detail-folder">Réparation</div>
        <div class="detail-stats">
          <div class="detail-stat"><span>Coût</span><strong>${euro(num(w.buyPrice) || 0)}</strong></div>
          <div class="detail-stat"><span>Prix réparation</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
          <div class="detail-stat"><span>Bénéfice</span><strong class="${profitClass(p)}">${euro(p)}</strong></div>
        </div>`;
    }

    html += `
      <div class="detail-actions">
        <button class="btn secondary" data-action="edit-watch">Modifier</button>
        <button class="btn danger" data-action="delete-watch">Supprimer</button>
      </div>`;
    els.main.innerHTML = html;
    bindCommon();
  }

  async function setFolderIncludedInTotals(folderId, checked, { rerender=true } = {}) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;
    const next = {
      ...folder,
      includeInTotals: !!checked,
      updatedAt: Date.now(),
      pendingSync: true
    };
    await WatchDB.put('folders', next);
    await loadData();
    if (rerender) render();
    syncFolderRecord(next, { quiet:true });
  }

  function bindCommon() {
    document.querySelectorAll('[data-folder-id]').forEach(el => el.addEventListener('click', () => setView('folder', el.dataset.folderId)));
    document.querySelectorAll('[data-folder-total-toggle]').forEach(el => el.addEventListener('change', async e => {
      e.stopPropagation();
      await setFolderIncludedInTotals(el.dataset.folderTotalToggle, el.checked);
      toast(el.checked ? 'Dossier inclus dans les totaux' : 'Dossier exclu des totaux');
    }));
    document.querySelectorAll('[data-watch-id]').forEach(el => {
      el.addEventListener('click', () => {
        if (Date.now() < state.suppressWatchClickUntil) return;
        setView('watch', el.dataset.watchId);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setView('watch', el.dataset.watchId);
        }
      });
    });
    document.querySelectorAll('[data-action="new-folder"]').forEach(el => el.addEventListener('click', showNewFolder));
    document.querySelectorAll('[data-action="open-history"]').forEach(el => el.addEventListener('click', () => setView('history')));
    document.querySelectorAll('[data-action="folder-menu"]').forEach(el => el.addEventListener('click', showFolderMenu));
    document.querySelectorAll('[data-action="edit-watch"]').forEach(el => el.addEventListener('click', () => showWatchForm(state.view.id)));
    document.querySelectorAll('[data-action="delete-watch"]').forEach(el => el.addEventListener('click', deleteCurrentWatch));
    const miscInput = document.getElementById('miscExpensesInput');
    if (miscInput) {
      const commitMiscExpenses = async () => {
        const value = Math.max(0, Number(String(miscInput.value).replace(',', '.')) || 0);
        if (Math.abs(value - (Number(state.miscExpenses) || 0)) < 0.005) return;
        const settings = await saveLocalSettings({ miscExpenses: value, updatedAt: Date.now(), pendingSync: true });
        render();
        syncSettingsRecord(settings, { quiet:true });
      };
      miscInput.addEventListener('change', commitMiscExpenses);
      miscInput.addEventListener('blur', commitMiscExpenses);
    }
  }

  function openSheet(html) {
    els.sheetContent.innerHTML = html;
    els.sheet.classList.remove('hidden');
    els.sheetBackdrop.classList.remove('hidden');
    els.sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    els.sheet.classList.add('hidden');
    els.sheetBackdrop.classList.add('hidden');
    els.sheet.setAttribute('aria-hidden', 'true');
    els.sheetContent.innerHTML = '';
    state.editingWatchId = null;
    state.draftPhotos = [];
  }

  function showNewFolder() {
    openSheet(`
      <h2 class="sheet-title">Nouveau dossier</h2>
      <form id="folderForm" class="form">
        <div class="field"><label>Nom du dossier</label><input id="folderName" maxlength="50" placeholder="Ex. À réparer" autofocus required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">Créer</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#folderForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = els.sheetContent.querySelector('#folderName').value.trim();
      if (!name) return;
      const now = Date.now();
      const folder = { id: newUuid(), name, order: state.folders.length, includeInTotals: true, createdAt: now, updatedAt: now, pendingSync: true };
      await WatchDB.put('folders', folder);
      await loadData(); closeSheet(); render(); toast('Dossier créé');
      syncFolderRecord(folder, { quiet:true });
    });
  }

  function showFolderMenu() {
    const folder = state.folders.find(f => f.id === state.view.id);
    if (!folder) return;
    const repair = isRepairFolder(folder);
    openSheet(`
      <h2 class="sheet-title">${esc(folder.name)}</h2>
      <div class="sheet-list">
        <label class="sheet-toggle">
          <div><strong>Inclure dans les totaux généraux</strong><small>${repair ? 'Coûts, recettes de réparation, bénéfice et trésorerie de l’accueil.' : 'Achat, recette, bénéfice et trésorerie de l’accueil.'}</small></div>
          <input type="checkbox" data-act="include-totals" ${folder.includeInTotals === false ? '' : 'checked'}>
        </label>
        ${repair ? '<div class="system-folder-note">Dossier spécial Folio : affichage en liste, sans photos.</div>' : `
          <button class="sheet-action" data-act="rename">Renommer le dossier</button>
          <button class="sheet-action danger" data-act="delete">Supprimer le dossier</button>
        `}
      </div>`);
    els.sheetContent.querySelector('[data-act="include-totals"]').addEventListener('change', async e => {
      await setFolderIncludedInTotals(folder.id, e.target.checked, { rerender:true });
      toast(e.target.checked ? 'Dossier inclus dans les totaux' : 'Dossier exclu des totaux');
    });
    if (!repair) {
      els.sheetContent.querySelector('[data-act="rename"]').addEventListener('click', () => showRenameFolder(folder));
      els.sheetContent.querySelector('[data-act="delete"]').addEventListener('click', () => deleteFolder(folder));
    }
  }

  function showRenameFolder(folder) {
    openSheet(`
      <h2 class="sheet-title">Renommer</h2>
      <form id="renameFolderForm" class="form">
        <div class="field"><label>Nom du dossier</label><input id="renameFolderName" maxlength="50" value="${esc(folder.name)}" required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#renameFolderForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = els.sheetContent.querySelector('#renameFolderName').value.trim();
      if (!name) return;
      const next = { ...folder, name, updatedAt: Date.now(), pendingSync: true };
      await WatchDB.put('folders', next);
      await loadData(); closeSheet(); render(); toast('Dossier renommé');
      syncFolderRecord(next, { quiet:true });
    });
  }

  async function deleteFolder(folder) {
    const watches = state.watches.filter(w => w.folderId === folder.id);
    if (watches.length) {
      alert('Ce dossier contient des objets. Déplace-les ou supprime-les avant de supprimer le dossier.');
      return;
    }
    if (!confirm(`Supprimer le dossier « ${folder.name} » ?`)) return;
    await WatchDB.del('folders', folder.id);
    if (FolioCloud.isSignedIn()) {
      try { await FolioCloud.deleteFolder(folder.id); setSyncStatus('synced'); }
      catch (err) { console.error(err); await enqueueDelete('delete-folder', folder.id); setSyncStatus('error', err.message); }
    } else {
      await enqueueDelete('delete-folder', folder.id);
    }
    await loadData(); closeSheet(); setView('home'); toast('Dossier supprimé');
  }

  function showWatchForm(watchId=null) {
    const existing = watchId ? state.watches.find(x => x.id === watchId) : null;
    const targetFolder = existing
      ? state.folders.find(f => f.id === existing.folderId)
      : (state.view.type === 'folder' ? state.folders.find(f => f.id === state.view.id) : null);

    if (isRepairFolder(targetFolder)) return showRepairForm(watchId);
    return showStandardWatchForm(watchId);
  }

  function showRepairForm(watchId=null) {
    const repairFolder = state.folders.find(isRepairFolder);
    if (!repairFolder) {
      ensureRepairFolder().then(() => loadData()).then(() => showRepairForm(watchId));
      return;
    }

    const w = watchId ? state.watches.find(x => x.id === watchId) : null;
    state.editingWatchId = w?.id || null;
    state.draftPhotos = [];
    openSheet(`
      <h2 class="sheet-title">${w ? 'Modifier la réparation' : 'Ajouter une réparation'}</h2>
      <form id="repairForm" class="form">
        <div class="field"><label>Nom / modèle de la montre</label><input id="repairName" value="${esc(w?.name || '')}" placeholder="Ex. Seiko 5 7009" autofocus required></div>
        <div class="money-grid">
          <div class="field"><label>Coût éventuel (€)</label><input id="repairCost" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.buyPrice ?? ''}" placeholder="0"></div>
          <div class="field"><label>Prix de la réparation (€)</label><input id="repairPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.sellPrice ?? ''}" placeholder="Laisser vide si pas encore facturée"></div>
        </div>
        <div class="profit-preview"><span>Bénéfice calculé</span><strong id="repairProfitPreview">—</strong></div>
        <div class="repair-form-note">Sans prix de réparation, le coût éventuel est compté comme un bénéfice négatif.</div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">${w ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);

    const q = sel => els.sheetContent.querySelector(sel);
    q('[data-close]').addEventListener('click', closeSheet);

    const update = () => {
      const cost = num(q('#repairCost').value) || 0;
      const price = num(q('#repairPrice').value) || 0;
      const profit = price - cost;
      const out = q('#repairProfitPreview');
      out.textContent = euro(profit);
      out.className = profitClass(profit);
    };
    q('#repairCost').addEventListener('input', update);
    q('#repairPrice').addEventListener('input', update);
    update();

    q('#repairForm').addEventListener('submit', async e => {
      e.preventDefault();
      const editingId = state.editingWatchId;
      const isEditing = !!editingId;
      const old = isEditing ? await WatchDB.get('watches', editingId) : null;
      if (isEditing && !old) {
        alert('Cette réparation a été actualisée pendant la modification. Resynchronise Folio puis réessaie.');
        return;
      }

      const data = {
        id: old ? old.id : newUuid(),
        name: q('#repairName').value.trim(),
        listingTitle: old?.listingTitle || '',
        askingPrice: old?.askingPrice ?? null,
        folderId: repairFolder.id,
        description: old?.description || '',
        buyPrice: num(q('#repairCost').value),
        fees: 0,
        sellPrice: num(q('#repairPrice').value),
        photos: [],
        order: old?.order ?? topOrderForFolder(repairFolder.id, old?.id || null),
        createdAt: old?.createdAt || Date.now(),
        updatedAt: Date.now(),
        pendingSync: 'full'
      };
      await WatchDB.put('watches', data);
      await loadData();
      closeSheet();
      setView('watch', data.id);
      toast(old ? 'Réparation modifiée' : 'Réparation ajoutée');
      syncItemRecord(data, { full:true, quiet:true }).then(loadData).catch(console.error);
    });
  }

  function showStandardWatchForm(watchId=null) {
    if (!state.folders.length) { showNewFolder(); return; }
    const w = watchId ? state.watches.find(x => x.id === watchId) : null;
    state.editingWatchId = w?.id || null;
    state.draftPhotos = w?.photos ? [...w.photos] : [];
    const folderId = w?.folderId || (state.view.type === 'folder' ? state.view.id : state.folders[0].id);
    openSheet(`
      <h2 class="sheet-title">${w ? 'Modifier l’objet' : 'Ajouter un objet'}</h2>
      <form id="watchForm" class="form">
        <div class="field"><label>Nom / modèle</label><input id="watchName" value="${esc(w?.name || '')}" placeholder="Ex. Seiko Lord Matic" required></div>
        <div class="field"><label>Titre de l’annonce</label><input id="listingTitle" value="${esc(w?.listingTitle ?? w?.name ?? '')}" placeholder="Ex. Seiko automatique vintage – cadran bleu"></div>
        <div class="field"><label>Prix demandé (€)</label><input id="askingPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.askingPrice ?? ''}" placeholder="Ex. 120"></div>
        <div class="field"><label>Dossier</label><select id="watchFolder">${state.folders.filter(f => !isRepairFolder(f)).map(f=>`<option value="${f.id}" ${f.id===folderId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div>
        <div id="photoDropZone" class="photo-input-wrap" tabindex="0">
          <label class="btn secondary" style="display:inline-block;">Ajouter des photos<input id="watchPhotos" type="file" accept="image/*" multiple hidden></label>
          <div class="drop-hint">Sur Mac/PC, tu peux aussi glisser tes photos ici.</div>
          <div class="photo-order-hint">Glisse une photo par la poignée ≡ pour changer son ordre. La première est la photo principale.</div>
          <div id="photoPreview" class="photo-preview-grid" aria-label="Photos de l’objet"></div>
        </div>
        <div class="field"><label>Description</label><textarea id="watchDescription" placeholder="État, référence, calibre, mesures, notes…">${esc(w?.description || '')}</textarea></div>
        <div class="money-grid">
          <div class="field"><label>Prix d'achat (€)</label><input id="buyPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.buyPrice ?? ''}"></div>
          <div class="field"><label>Frais (€)</label><input id="fees" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.fees ?? ''}"></div>
        </div>
        <div class="field"><label>Prix de vente (€)</label><input id="sellPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.sellPrice ?? ''}" placeholder="Laisser vide si non vendue"></div>
        <div class="profit-preview"><span>Bénéfice calculé</span><strong id="profitPreview">—</strong></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">${w ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);

    const q = s => els.sheetContent.querySelector(s);
    q('[data-close]').addEventListener('click', closeSheet);
    const addImageFiles = files => {
      const images = [...files].filter(f => {
        if (!f) return false;
        if (f.type?.startsWith('image/')) return true;
        return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name || '');
      });
      if (!images.length) return;
      state.draftPhotos.push(...images);
      renderPhotoPreview();
    };

    q('#watchPhotos').addEventListener('change', e => {
      addImageFiles(e.target.files || []);
      e.target.value = '';
    });

    const dropZone = q('#photoDropZone');
    const isFileDrag = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
    ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, e => {
      // La zone parente ne doit pas intercepter le glisser interne servant à
      // réordonner les photos. Elle ne s'active que pour des fichiers venant
      // du Finder / explorateur de fichiers.
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      dropZone.classList.add('drag-over');
    }));
    dropZone.addEventListener('dragleave', e => {
      if (isFileDrag(e)) dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      addImageFiles(e.dataTransfer.files);
    });

    ['#buyPrice','#fees','#sellPrice'].forEach(s => q(s).addEventListener('input', updateProfitPreview));
    q('#watchForm').addEventListener('submit', saveWatchForm);
    renderPhotoPreview();
    updateProfitPreview();
  }

  function moveDraftPhoto(from, to) {
    from = Number(from); to = Number(to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
    if (from < 0 || to < 0 || from >= state.draftPhotos.length || to >= state.draftPhotos.length) return;
    const [photo] = state.draftPhotos.splice(from, 1);
    state.draftPhotos.splice(to, 0, photo);
  }

  function renderPhotoPreview() {
    const root = els.sheetContent.querySelector('#photoPreview');
    if (!root) return;
    const old = root.querySelectorAll('img[data-preview-url]');
    old.forEach(img => URL.revokeObjectURL(img.dataset.previewUrl));
    root.innerHTML = state.draftPhotos.map((blob,i) => {
      const url = URL.createObjectURL(blob);
      return `<div class="preview-item" draggable="true" data-photo-item="${i}" aria-label="Photo ${i+1}${i===0?', principale':''}">
        <img src="${url}" data-preview-url="${url}" alt="Photo ${i+1}" draggable="false">
        <button type="button" class="remove-photo" data-remove-photo="${i}" aria-label="Supprimer la photo ${i+1}">×</button>
        <div class="photo-drag-handle" aria-hidden="true">≡</div>
        ${i===0?'<div class="primary-photo-label">Principale</div>':''}
      </div>`;
    }).join('');

    root.querySelectorAll('[data-remove-photo]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      state.draftPhotos.splice(Number(btn.dataset.removePhoto), 1);
      renderPhotoPreview();
    }));

    // Ordinateur : la vignette entière reste déplaçable avec le glisser-déposer natif.
    let draggedIndex = null;
    root.querySelectorAll('.preview-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        draggedIndex = Number(item.dataset.photoItem);
        item.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', String(draggedIndex)); } catch (_) {}
        }
      });
      item.addEventListener('dragover', e => {
        // Empêche la zone d'ajout parente de transformer le curseur en "copie".
        if (e.dataTransfer?.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        item.classList.add('drag-target');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-target'));
      item.addEventListener('drop', e => {
        // Un fichier venant du Finder doit être traité par la zone d’ajout parente.
        if (e.dataTransfer?.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        const to = Number(item.dataset.photoItem);
        const fromText = e.dataTransfer?.getData('text/plain');
        const from = draggedIndex ?? (fromText === '' ? NaN : Number(fromText));
        moveDraftPhoto(from, to);
        renderPhotoPreview();
      });
      item.addEventListener('dragend', () => {
        draggedIndex = null;
        root.querySelectorAll('.preview-item').forEach(el => el.classList.remove('is-dragging','drag-target'));
      });
    });

    // Téléphone + ordinateur : la poignée ≡ utilise Pointer Events.
    // Elle démarre immédiatement le déplacement, sans appui prolongé : cela évite
    // que le navigateur interprète le geste comme un scroll avant que Folio ne
    // puisse prendre la main.
    let pointerDrag = null;

    const reindexPreviewItems = () => {
      [...root.querySelectorAll('.preview-item')].forEach((el, index) => {
        el.dataset.photoItem = String(index);
        const remove = el.querySelector('[data-remove-photo]');
        if (remove) remove.dataset.removePhoto = String(index);
      });
    };

    const finishPointerDrag = (e, handle) => {
      if (!pointerDrag || (e && e.pointerId !== pointerDrag.pointerId)) return;
      const current = pointerDrag;
      pointerDrag = null;
      try { handle.releasePointerCapture(current.pointerId); } catch (_) {}
      current.item.classList.remove('is-touch-sorting');
      root.classList.remove('is-sorting');
      if (current.changed) renderPhotoPreview();
    };

    root.querySelectorAll('.preview-item').forEach(item => {
      const handle = item.querySelector('.photo-drag-handle');
      if (!handle) return;

      handle.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        pointerDrag = {
          pointerId: e.pointerId,
          item,
          index: Number(item.dataset.photoItem),
          changed: false
        };
        item.classList.add('is-touch-sorting');
        root.classList.add('is-sorting');
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        if (e.pointerType !== 'mouse' && navigator.vibrate) navigator.vibrate(15);
      });

      handle.addEventListener('pointermove', e => {
        if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
        e.preventDefault();

        const underPointer = document.elementFromPoint(e.clientX, e.clientY);
        const target = underPointer?.closest?.('.preview-item');
        if (!target || !root.contains(target) || target === pointerDrag.item) return;

        const targetIndex = Number(target.dataset.photoItem);
        if (!Number.isInteger(targetIndex) || targetIndex === pointerDrag.index) return;

        moveDraftPhoto(pointerDrag.index, targetIndex);
        if (pointerDrag.index < targetIndex) target.after(pointerDrag.item);
        else target.before(pointerDrag.item);
        reindexPreviewItems();
        pointerDrag.index = targetIndex;
        pointerDrag.changed = true;
      });

      handle.addEventListener('pointerup', e => finishPointerDrag(e, handle));
      handle.addEventListener('pointercancel', e => finishPointerDrag(e, handle));
      handle.addEventListener('lostpointercapture', e => {
        if (pointerDrag && e.pointerId === pointerDrag.pointerId) finishPointerDrag(null, handle);
      });
    });
  }

  function updateProfitPreview() {
    const q = s => els.sheetContent.querySelector(s);
    const buy = num(q('#buyPrice')?.value) || 0;
    const fees = num(q('#fees')?.value) || 0;
    const sell = num(q('#sellPrice')?.value);
    const out = q('#profitPreview');
    if (!out) return;
    if (sell === null) { out.textContent = '—'; out.className=''; return; }
    const p = sell - buy - fees;
    out.textContent = euro(p);
    out.className = profitClass(p);
  }

  async function saveWatchForm(e) {
    e.preventDefault();
    const q = s => els.sheetContent.querySelector(s);

    // En mode modification, une fiche existante doit TOUJOURS conserver son identifiant.
    // On relit directement IndexedDB plutôt que de dépendre uniquement de state.watches,
    // qui peut être rafraîchi en arrière-plan par une synchronisation pendant que le
    // formulaire est ouvert. Si la fiche n'est plus trouvée, on bloque l'enregistrement
    // au lieu de créer silencieusement un nouvel objet (ce qui provoquait un doublon).
    const editingId = state.editingWatchId;
    const isEditing = !!editingId;
    const old = isEditing ? await WatchDB.get('watches', editingId) : null;
    if (isEditing && !old) {
      alert('Cette fiche a été actualisée pendant la modification. Ferme cette fenêtre, resynchronise Folio puis réessaie. Aucune copie n’a été créée.');
      return;
    }

    const destinationFolderId = q('#watchFolder').value;
    const movedToAnotherFolder = !!old && old.folderId !== destinationFolderId;
    const data = {
      id: old ? old.id : newUuid(),
      name: q('#watchName').value.trim(),
      listingTitle: q('#listingTitle').value.trim(),
      askingPrice: num(q('#askingPrice').value),
      folderId: destinationFolderId,
      description: q('#watchDescription').value.trim(),
      buyPrice: num(q('#buyPrice').value),
      fees: num(q('#fees').value),
      sellPrice: num(q('#sellPrice').value),
      photos: [...state.draftPhotos],
      order: old && old.folderId === destinationFolderId ? old.order : topOrderForFolder(destinationFolderId, old?.id || null),
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
      pendingSync: 'full'
    };
    await WatchDB.put('watches', data);
    await loadData();
    const id = data.id;
    closeSheet();
    setView('watch', id);
    toast(old ? (movedToAnotherFolder ? 'Objet déplacé' : 'Objet modifié') : 'Objet ajouté');
    syncItemRecord(data, { full:true, quiet:true }).then(loadData).catch(console.error);
  }

  async function deleteCurrentWatch() {
    const w = state.watches.find(x => x.id === state.view.id);
    if (!w) return;
    if (!confirm(`Supprimer « ${w.name || 'cet objet'} » ?`)) return;
    const folderId = w.folderId;
    await WatchDB.del('watches', w.id);
    if (FolioCloud.isSignedIn()) {
      try { await FolioCloud.deleteItem(w.id); setSyncStatus('synced'); }
      catch (err) { console.error(err); await enqueueDelete('delete-item', w.id); setSyncStatus('error', err.message); }
    } else {
      await enqueueDelete('delete-item', w.id);
    }
    await loadData();
    setView('folder', folderId);
    toast('Objet supprimé');
  }

  function showMainMenu() {
    const connected = FolioCloud.isSignedIn();
    openSheet(`
      <h2 class="sheet-title">Menu</h2>
      <div class="sheet-list">
        <button class="sheet-action" data-menu="sync"><strong>${connected ? 'Synchroniser Folio' : 'Activer la synchronisation'}</strong><small>${connected ? 'Récupère les changements faits sur le Mac ou le téléphone.' : 'Connecte cette installation à ta bibliothèque privée.'}</small></button>
        <button class="sheet-action" data-menu="export">Exporter Folio</button>
        <button class="sheet-action" data-menu="import">Importer sur cet appareil</button>
        <button class="sheet-action" data-menu="new-folder">Créer un dossier</button>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-top:14px;">
        Les données sont conservées localement et, une fois connecté, synchronisées avec ton espace privé Supabase. L’export .folio reste une sauvegarde indépendante.
      </div>`);
    els.sheetContent.querySelector('[data-menu="sync"]').addEventListener('click', showSyncMenu);
    els.sheetContent.querySelector('[data-menu="export"]').addEventListener('click', exportBackup);
    els.sheetContent.querySelector('[data-menu="import"]').addEventListener('click', () => { closeSheet(); els.backupFile.click(); });
    els.sheetContent.querySelector('[data-menu="new-folder"]').addEventListener('click', showNewFolder);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    if (dataURL instanceof Blob) return dataURL;
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return null;
    const [meta, data] = dataURL.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
    const bin = atob(data); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], {type:mime});
  }

  function safeStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async function buildBackupPayload() {
    const items = [];
    for (const w of state.watches) {
      const photos = [];
      for (const p of (w.photos || [])) photos.push(await blobToDataURL(p));
      items.push({ ...w, photos });
    }
    return {
      format: 'folio-backup',
      version: 6,
      app: 'Folio',
      exportedAt: new Date().toISOString(),
      settings: {
        miscExpenses: Number(state.miscExpenses) || 0,
        updatedAt: Number(state.miscExpensesUpdatedAt) || Date.now()
      },
      folders: state.folders,
      items
    };
  }

  function downloadPayload(payload, filename) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function exportBackup({ close = true, prefix = 'Folio' } = {}) {
    try {
      const payload = await buildBackupPayload();
      downloadPayload(payload, `${prefix}-${safeStamp()}.folio`);
      if (close) closeSheet();
      toast('Sauvegarde Folio exportée');
      return true;
    } catch (err) {
      console.error(err);
      alert('Impossible de créer la sauvegarde Folio.');
      return false;
    }
  }

  function normalizeImportedBackup(data) {
    const items = Array.isArray(data?.items) ? data.items : data?.watches;
    if (!data || !Array.isArray(data.folders) || !Array.isArray(items)) throw new Error('Format incorrect');
    return {
      version: Number(data.version) || 1,
      exportedAt: data.exportedAt || null,
      settings: data.settings && typeof data.settings === 'object' ? {
        miscExpenses: Math.max(0, Number(data.settings.miscExpenses) || 0),
        updatedAt: Number(data.settings.updatedAt) || 0
      } : null,
      folders: data.folders
        .filter(f => f && f.id && typeof f.name === 'string')
        .map(f => ({ ...f, includeInTotals: f.includeInTotals !== false })),
      items: items.filter(w => w && w.id)
    };
  }

  async function hydrateImportedItem(w, folderIdMap = new Map()) {
    const photos = (w.photos || []).map(dataURLToBlob).filter(Boolean);
    return {
      ...w,
      folderId: folderIdMap.get(w.folderId) || w.folderId,
      photos,
      createdAt: Number(w.createdAt) || Date.now(),
      updatedAt: Number(w.updatedAt) || Number(w.createdAt) || Date.now()
    };
  }

  function showImportChoice(data, filename) {
    const dateText = data.exportedAt ? new Date(data.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
    const localIds = new Set(state.watches.map(w => w.id));
    const newCount = data.items.filter(w => !localIds.has(w.id)).length;
    openSheet(`
      <h2 class="sheet-title">Importer Folio</h2>
      <div class="import-summary">
        <strong>${esc(filename || 'Sauvegarde Folio')}</strong>
        <span>${data.folders.length} dossier${data.folders.length > 1 ? 's' : ''} · ${data.items.length} objet${data.items.length > 1 ? 's' : ''}</span>
        <span>${newCount} nouvel${newCount > 1 ? 's' : ''} objet${newCount > 1 ? 's' : ''} absent${newCount > 1 ? 's' : ''} de cet appareil</span>
        <span>Sauvegarde : ${esc(dateText)}</span>
      </div>
      <div class="sheet-list">
        <button class="sheet-action import-primary" data-import="new-only"><strong>Nouveaux uniquement</strong><small>Ajoute seulement les objets absents. Aucun objet déjà présent n’est modifié.</small></button>
        <button class="sheet-action" data-import="merge"><strong>Fusionner</strong><small>Ajoute les nouveaux objets et met à jour les objets existants si la sauvegarde est plus récente.</small></button>
        <button class="sheet-action danger" data-import="replace"><strong>Remplacer la collection</strong><small>Une sauvegarde de sécurité de cet appareil sera exportée avant le remplacement.</small></button>
        <button class="sheet-action" data-import="cancel">Annuler</button>
      </div>`);
    els.sheetContent.querySelector('[data-import="new-only"]').addEventListener('click', () => importNewOnly(data));
    els.sheetContent.querySelector('[data-import="merge"]').addEventListener('click', () => mergeBackup(data));
    els.sheetContent.querySelector('[data-import="replace"]').addEventListener('click', () => replaceBackup(data));
    els.sheetContent.querySelector('[data-import="cancel"]').addEventListener('click', closeSheet);
  }

  async function importNewOnly(data) {
    try {
      const localFolders = await WatchDB.getAll('folders');
      const localItems = await WatchDB.getAll('watches');
      const localIds = new Set(localItems.map(w => w.id));
      const newItems = data.items.filter(w => !localIds.has(w.id));

      if (!newItems.length) {
        closeSheet();
        toast('Aucun nouvel objet à importer');
        return;
      }

      const neededFolderIds = new Set(newItems.map(w => w.folderId).filter(Boolean));
      const foldersById = new Map(localFolders.map(f => [f.id, f]));
      const foldersByName = new Map(localFolders.map(f => [String(f.name).trim().toLocaleLowerCase('fr'), f]));
      const incomingFoldersById = new Map(data.folders.map(f => [f.id, f]));
      const folderIdMap = new Map();
      let addedFolders = 0;

      for (const incomingId of neededFolderIds) {
        const incoming = incomingFoldersById.get(incomingId);
        if (!incoming) continue;
        const sameId = foldersById.get(incoming.id);
        const sameName = foldersByName.get(String(incoming.name).trim().toLocaleLowerCase('fr'));
        if (sameId) {
          folderIdMap.set(incoming.id, sameId.id);
        } else if (sameName) {
          folderIdMap.set(incoming.id, sameName.id);
        } else {
          const next = {
            ...incoming,
            createdAt: Number(incoming.createdAt) || Date.now(),
            updatedAt: Number(incoming.updatedAt) || Number(incoming.createdAt) || Date.now()
          };
          await WatchDB.put('folders', next);
          folderIdMap.set(incoming.id, next.id);
          foldersById.set(next.id, next);
          foldersByName.set(String(next.name).trim().toLocaleLowerCase('fr'), next);
          addedFolders++;
        }
      }

      // Dans un dossier déjà présent, les nouveaux objets sont ajoutés à la fin
      // afin de ne pas modifier l’ordre des fiches existantes.
      const nextOrderByFolder = new Map();
      for (const f of localFolders) {
        const existing = localItems.filter(w => w.folderId === f.id);
        const maxOrder = existing.map(w => Number(w.order)).filter(Number.isFinite);
        nextOrderByFolder.set(f.id, maxOrder.length ? Math.max(...maxOrder) + 1 : existing.length);
      }

      let addedItems = 0;
      for (const incoming of newItems) {
        const next = await hydrateImportedItem(incoming, folderIdMap);
        if (!next.folderId || !foldersById.has(next.folderId)) continue;
        const existingFolderWasLocal = localFolders.some(f => f.id === next.folderId);
        if (existingFolderWasLocal) {
          const order = nextOrderByFolder.get(next.folderId) ?? 0;
          next.order = order;
          nextOrderByFolder.set(next.folderId, order + 1);
        }
        await WatchDB.put('watches', next);
        addedItems++;
      }

      await loadData();
      closeSheet();
      setView('home');
      toast(`${addedItems} nouvel${addedItems > 1 ? 's' : ''} objet${addedItems > 1 ? 's' : ''} importé${addedItems > 1 ? 's' : ''}`);
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible d’importer uniquement les nouveaux objets.');
    }
  }

  async function mergeBackup(data) {
    try {
      const localFolders = await WatchDB.getAll('folders');
      const localItems = await WatchDB.getAll('watches');
      const foldersById = new Map(localFolders.map(f => [f.id, f]));
      const foldersByName = new Map(localFolders.map(f => [String(f.name).trim().toLocaleLowerCase('fr'), f]));
      const folderIdMap = new Map();
      let addedFolders = 0, updatedFolders = 0, addedItems = 0, updatedItems = 0;

      for (const incoming of data.folders) {
        const sameId = foldersById.get(incoming.id);
        const key = String(incoming.name).trim().toLocaleLowerCase('fr');
        const sameName = foldersByName.get(key);
        if (sameId) {
          folderIdMap.set(incoming.id, sameId.id);
          const localTime = Number(sameId.updatedAt) || Number(sameId.createdAt) || 0;
          const incomingTime = Number(incoming.updatedAt) || Number(incoming.createdAt) || 0;
          if (incomingTime > localTime) {
            const next = { ...sameId, ...incoming, updatedAt: incomingTime || Date.now() };
            await WatchDB.put('folders', next);
            foldersById.set(next.id, next);
            foldersByName.set(String(next.name).trim().toLocaleLowerCase('fr'), next);
            updatedFolders++;
          }
        } else if (sameName) {
          folderIdMap.set(incoming.id, sameName.id);
        } else {
          const next = { ...incoming, createdAt: Number(incoming.createdAt) || Date.now(), updatedAt: Number(incoming.updatedAt) || Number(incoming.createdAt) || Date.now() };
          await WatchDB.put('folders', next);
          folderIdMap.set(incoming.id, next.id);
          foldersById.set(next.id, next);
          foldersByName.set(key, next);
          addedFolders++;
        }
      }

      const itemsById = new Map(localItems.map(w => [w.id, w]));
      for (const incoming of data.items) {
        const next = await hydrateImportedItem(incoming, folderIdMap);
        const local = itemsById.get(next.id);
        if (!local) {
          await WatchDB.put('watches', next);
          itemsById.set(next.id, next);
          addedItems++;
          continue;
        }
        const localTime = Number(local.updatedAt) || Number(local.createdAt) || 0;
        const incomingTime = Number(next.updatedAt) || Number(next.createdAt) || 0;
        if (incomingTime > localTime) {
          await WatchDB.put('watches', next);
          itemsById.set(next.id, next);
          updatedItems++;
        }
      }

      if (data.settings) {
        const localSettings = await WatchDB.get('settings', 'main');
        const localTime = Number(localSettings?.updatedAt) || 0;
        const incomingTime = Number(data.settings.updatedAt) || 0;
        if (!localSettings || incomingTime > localTime) {
          await saveLocalSettings({ miscExpenses: data.settings.miscExpenses, updatedAt: incomingTime || Date.now(), pendingSync: true });
        }
      }
      await loadData();
      closeSheet();
      setView('home');
      toast(`Fusion terminée · ${addedItems} ajouté${addedItems > 1 ? 's' : ''}, ${updatedItems} mis à jour`);
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible de fusionner cette sauvegarde.');
    }
  }

  async function replaceBackup(data) {
    try {
      const hasLocalData = state.folders.length || state.watches.length;
      if (hasLocalData) {
        const ok = await exportBackup({ close: false, prefix: 'Folio-securite-avant-import' });
        if (!ok) return;
      }

      await WatchDB.clear('watches');
      await WatchDB.clear('folders');
      await WatchDB.clear('settings');
      const folderIds = new Set();
      for (const f of data.folders) {
        const next = { ...f, createdAt: Number(f.createdAt) || Date.now(), updatedAt: Number(f.updatedAt) || Number(f.createdAt) || Date.now() };
        await WatchDB.put('folders', next);
        folderIds.add(next.id);
      }
      for (const w of data.items) {
        const next = await hydrateImportedItem(w);
        if (folderIds.has(next.folderId)) await WatchDB.put('watches', next);
      }
      await saveLocalSettings({
        miscExpenses: data.settings?.miscExpenses || 0,
        updatedAt: data.settings?.updatedAt || Date.now(),
        pendingSync: true
      });

      await loadData();
      closeSheet();
      setView('home');
      toast('Collection remplacée');
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible de remplacer la collection. Les données locales n’ont pas été modifiées volontairement après l’erreur.');
    }
  }

  async function importBackup(file) {
    try {
      const data = normalizeImportedBackup(JSON.parse(await file.text()));
      showImportChoice(data, file.name);
    } catch (err) {
      console.error(err);
      alert('Ce fichier n’est pas une sauvegarde Folio valide.');
    }
  }

  function toast(message) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div'); el.className='toast'; el.textContent=message; document.body.appendChild(el);
    setTimeout(()=>el.remove(), 2200);
  }

  els.backBtn.addEventListener('click', () => {
    if (state.view.type === 'watch') {
      const w = state.watches.find(x => x.id === state.view.id);
      setView(w?.folderId ? 'folder' : 'home', w?.folderId || null);
    } else if (state.view.type === 'history-era') {
      setView('history');
    } else setView('home');
  });
  els.menuBtn.addEventListener('click', showMainMenu);
  els.syncBadge?.addEventListener('click', showSyncMenu);
  els.fab.addEventListener('click', () => showWatchForm());
  els.sheetBackdrop.addEventListener('click', closeSheet);
  els.backupFile.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) importBackup(f);
    e.target.value='';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
  }

  (async () => {
    await WatchDB.open();
    await normalizeLocalIds();
    await loadData();

    const restored = await FolioCloud.restoreSession();
    if (restored) {
      setSyncStatus('syncing');
      if (!state.folders.length) await initDefaults();
      await loadData();
      render();
      await syncNow({ silent:true });
    } else {
      if (!state.folders.length) await initDefaults();
      await ensureRepairFolder({ sync:false });
      await loadData();
      setSyncStatus('local');
      render();
      setTimeout(() => showLoginSheet(), 350);
    }
  })();

  window.addEventListener('online', () => {
    if (FolioCloud.isSignedIn()) syncNow({ silent:true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && FolioCloud.isSignedIn()) syncNow({ silent:true });
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine && FolioCloud.isSignedIn()) syncNow({ silent:true });
  }, 60000);
})();
