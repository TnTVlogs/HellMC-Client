import type { Messages } from './en'

const ca: Messages = {
  nav: {
    ariaLabel: 'Navegació principal',
    home: 'Inici',
    servers: 'Servidors',
    versions: 'Versions',
    news: 'Notícies',
    settings: 'Configuració'
  },
  placeholder: {
    comingSoon: 'Properament.'
  },
  settings: {
    nav: {
      account: 'Compte',
      game: 'Joc',
      java: 'Java',
      launcher: 'Launcher',
      updates: 'Actualitzacions',
      about: 'Sobre'
    },
    account: {
      microsoftTitle: 'Compte de Microsoft',
      microsoftConnect: 'Afegeix un compte de Microsoft',
      offlineTitle: 'Compte offline',
      offlineUsernamePlaceholder: 'Nom d\'usuari',
      addOffline: 'Afegeix compte',
      empty: 'Encara no hi ha cap compte.',
      active: 'Actiu',
      select: 'Fes servir aquest compte',
      remove: 'Elimina'
    },
    game: {
      title: 'Joc',
      resolution: 'Mida de la finestra',
      width: 'Amplada',
      height: 'Alçada',
      fullscreen: 'Inicia en pantalla completa',
      autoConnect: 'Connecta automàticament al servidor',
      launchDetached: 'Mantén el joc obert si es tanca el launcher',
      dataDirectory: 'Carpeta de dades',
      dataDirectoryChange: 'Canvia…',
      dataDirectoryRestartHint: 'S\'aplica en reiniciar el launcher.',
      sharedDataRoot: 'Ubicació de les dades compartides',
      sharedDataRootHelp: 'On guarden les versions marcades «compartides» els seus mons, packs de recursos, shaders, captures i opcions. Aplica a totes les versions compartides alhora.',
      sharedDataRootHellmc: 'HellMC (per defecte)',
      sharedDataRootSystem: '.minecraft del sistema'
    },
    java: {
      title: 'Java',
      globalExecutable: 'Executable de Java global per defecte',
      globalExecutableHelp: 'Es fa servir per a versions que encara no has configurat. Una versió ja configurada (Versions > detall > Java) conserva la seva pròpia elecció.',
      notSet: 'Sense definir — les versions noves detecten o pregunten automàticament, com fins ara.',
      choose: 'Tria…',
      clear: 'Treu',
      detectedTitle: 'Instal·lacions de Java detectades',
      detectedEmpty: 'No s\'ha trobat cap instal·lació de Java en aquest sistema.',
      detecting: 'Cercant…'
    },
    launcher: {
      title: 'Launcher',
      language: 'Idioma',
      theme: 'Tema',
      themeSystem: 'Sistema',
      themeDark: 'Fosc',
      themeLight: 'Clar',
      uiScale: 'Mida de la interfície',
      performance: 'Mode de rendiment',
      performanceAuto: 'Automàtic',
      performanceOn: 'Activat',
      performanceOff: 'Desactivat',
      sidebarCollapsed: 'Replega la barra lateral',
      devMode: 'Mode desenvolupador',
      devModeHint: 'Clica unes quantes vegades el número de versió a Sobre per revelar això.'
    },
    updates: {
      title: 'Actualitzacions',
      currentVersion: 'Versió actual',
      checkNow: 'Comprova ara',
      checking: 'Comprovant actualitzacions…',
      upToDate: 'Estàs al dia.',
      available: 'Actualització {version} trobada — baixant en segon pla.',
      downloading: 'Baixant actualització… {percent}%',
      ready: 'Actualització a punt.',
      readyHint: 'S\'instal·larà sola el proper cop que tanquis el launcher — no cal fer res.',
      error: 'No s\'ha pogut comprovar si hi ha actualitzacions: {message}'
    },
    about: {
      title: 'Sobre',
      forkNotice: 'HellMC Client és un fork de HeliosLauncher de Daniel D. Scalzi (llicència MIT).',
      coreNotice: 'Utilitza HellMC-Core, un fork modificat de helios-core (LGPL-3.0).',
      nebulaNotice: 'Servidor de distribució basat en Nebula (Daniel D. Scalzi, MIT).',
      thirdPartyLicenses: 'Llicències de tercers',
      website: 'Web',
      source: 'Codi font',
      support: 'Suport'
    }
  },
  home: {
    title: 'Inici',
    loadingDistro: 'Carregant distribució…',
    noServer: 'Sense servidor',
    noVersionAvailable: 'No hi ha cap versió disponible',
    playingAs: 'Jugant com a {name}',
    play: 'Jugar',
    cancel: 'Cancel·la',
    noAccount: 'Afegeix un compte sense connexió per començar a jugar.',
    offlineUsernamePlaceholder: 'Nom d’usuari',
    addOfflineAccount: 'Afegeix compte',
    phase: {
      idle: 'Inactiu',
      starting: 'Iniciant…',
      'refreshing-distribution': 'Comprovant actualitzacions…',
      'validating-account': 'Validant compte…',
      'verifying-files': 'Verificant fitxers…',
      downloading: 'Descarregant…',
      launching: 'Iniciant el joc…',
      ready: 'Iniciat',
      closed: 'Tancat',
      error: 'Error'
    }
  },
  servers: {
    playWithoutServer: 'Jugar sense servidor',
    playWithoutServerDesc: 'Tria una versió i juga en local o a qualsevol servidor.',
    empty: 'Encara no hi ha servidors publicats.',
    versionsCount: '{count} versions'
  },
  serverDetail: {
    notFound: 'Servidor no trobat.',
    back: 'Torna a servidors',
    version: 'Versió',
    recommended: 'recomanada'
  },
  versions: {
    empty: 'Encara no hi ha versions publicades.',
    install: 'Instal·la',
    installed: 'Instal·lada',
    notInstalled: 'No instal·lada',
    updateAvailable: 'Actualització disponible'
  },
  versionDetail: {
    notFound: 'Versió no trobada.',
    back: 'Torna a versions',
    verify: 'Verifica',
    uninstall: 'Desinstal·la',
    uninstallConfirm: {
      title: 'Desinstal·lar aquesta versió?',
      message: 'Això allibera {size} de disc. S’esborren mods, biblioteques i configuració gestionada; es conserven les teves partides, captures i opcions.',
      confirm: 'Desinstal·la',
      cancel: 'Cancel·la'
    },
    changelog: 'Canvis',
    tabs: {
      summary: 'Resum',
      mods: 'Mods',
      java: 'Java i memòria',
      files: 'Fitxers'
    },
    files: {
      path: 'Carpeta de la instància',
      openFolder: 'Obre la carpeta',
      size: 'Mida al disc',
      notInstalled: 'Encara no instal·lada — aquí és on s’instal·larà.'
    },
    mods: {
      search: 'Cerca mods…',
      count: '{enabled} de {total} activats',
      required: 'Obligatori',
      blocked: 'No es pot desactivar: l’usen {list}.',
      alsoEnabled: 'També s’han activat (els necessita): {list}.',
      alsoDisabled: 'També s’han desactivat (ja no els necessita ningú): {list}.',
      andMore: 'i {count} més',
      empty: 'Aquesta versió no té mods.'
    },
    dataSharing: {
      title: 'Comparteix mons, packs de recursos i opcions amb altres versions',
      help: 'Els mons, textures, shaders, captures i opcions es comparteixen amb les altres versions que també ho tinguin activat. Els mods i la seva configuració es queden sempre separats per versió.',
      changeNotice: 'Aquest canvi s’aplicarà la propera vegada que juguis amb aquesta versió.',
      forcedNotice: 'Aquesta versió sempre té les seves pròpies dades.',
      forcedTooltip: 'L’administrador del servidor ha fixat que aquesta versió mai comparteixi dades amb les altres.'
    },
    java: {
      executable: 'Executable de Java',
      notConfigured: 'No configurat',
      noneFound: 'No s’ha trobat cap instal·lació de Java compatible.',
      detecting: 'Detectant…',
      autoDetect: 'Detecta automàticament',
      chooseManually: 'Tria manualment',
      downloadAuto: 'Baixa Java automàticament',
      downloading: 'Baixant Java…',
      downloadFailed: 'La baixada de Java ha fallat. Torna-ho a provar o tria una instal·lació de Java manualment.',
      phase: {
        fetchingJdk: 'Buscant la versió adequada…',
        downloadingJava: 'Baixant Java',
        extractingJava: 'Extraient…'
      },
      minRam: 'RAM mínima',
      maxRam: 'RAM màxima'
    }
  },
  news: {
    title: 'Notícies',
    loading: 'Carregant notícies…',
    offlineCache: 'Mostrant notícies desades (sense connexió).',
    filterAll: 'Totes',
    global: 'Generals',
    back: 'Torna a notícies',
    openWeb: 'Obre al web',
    refresh: 'Actualitza',
    empty: 'Encara no hi ha notícies.',
    offlineBanner: 'Últimes notícies descarregades: {date}'
  },
  instances: {
    running: '{count} en marxa',
    forceClose: 'Força el tancament',
    confirmTitle: 'Vols forçar el tancament d’aquesta instància?',
    confirmMessage: 'Això tancarà {version} immediatament. Es perdrà qualsevol progrés no desat.',
    confirmForceClose: 'Sí, força’l',
    cancel: 'Cancel·la'
  }
}

export default ca
