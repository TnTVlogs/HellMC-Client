import type { Messages } from './en'

const es: Messages = {
  nav: {
    ariaLabel: 'Navegación principal',
    home: 'Inicio',
    servers: 'Servidores',
    versions: 'Versiones',
    news: 'Noticias',
    settings: 'Configuración'
  },
  placeholder: {
    comingSoon: 'Próximamente.'
  },
  settings: {
    nav: {
      account: 'Cuenta',
      game: 'Juego',
      java: 'Java',
      launcher: 'Launcher',
      updates: 'Actualizaciones',
      about: 'Acerca de'
    },
    account: {
      microsoftTitle: 'Cuenta de Microsoft',
      microsoftConnect: 'Añadir cuenta de Microsoft',
      offlineTitle: 'Cuenta sin conexión',
      offlineUsernamePlaceholder: 'Nombre de usuario',
      addOffline: 'Añadir cuenta',
      empty: 'Todavía no hay ninguna cuenta.',
      active: 'Activa',
      select: 'Usar esta cuenta',
      remove: 'Eliminar'
    },
    game: {
      title: 'Juego',
      resolution: 'Tamaño de la ventana',
      width: 'Ancho',
      height: 'Alto',
      fullscreen: 'Iniciar en pantalla completa',
      autoConnect: 'Conectar automáticamente al servidor',
      launchDetached: 'Mantener el juego abierto si se cierra el launcher',
      dataDirectory: 'Carpeta de datos',
      dataDirectoryChange: 'Cambiar…',
      dataDirectoryRestartHint: 'Se aplica al reiniciar el launcher.',
      sharedDataRoot: 'Ubicación de los datos compartidos',
      sharedDataRootHelp: 'Dónde guardan las versiones marcadas como "compartidas" sus mundos, packs de recursos, shaders, capturas y opciones. Aplica a todas las versiones compartidas a la vez.',
      sharedDataRootHellmc: 'HellMC (por defecto)',
      sharedDataRootSystem: '.minecraft del sistema'
    },
    java: {
      title: 'Java',
      globalExecutable: 'Ejecutable de Java global por defecto',
      globalExecutableHelp: 'Se usa para versiones que todavía no has configurado. Una versión que ya configuraste (Versiones > detalle > Java) conserva su propia elección.',
      notSet: 'Sin definir — las versiones nuevas detectan o preguntan automáticamente, como antes.',
      choose: 'Elegir…',
      clear: 'Quitar',
      detectedTitle: 'Instalaciones de Java detectadas',
      detectedEmpty: 'No se ha encontrado ninguna instalación de Java en este sistema.',
      detecting: 'Buscando…'
    },
    launcher: {
      title: 'Launcher',
      language: 'Idioma',
      theme: 'Tema',
      themeSystem: 'Sistema',
      themeDark: 'Oscuro',
      themeLight: 'Claro',
      uiScale: 'Tamaño de la interfaz',
      performance: 'Modo de rendimiento',
      performanceAuto: 'Automático',
      performanceOn: 'Activado',
      performanceOff: 'Desactivado',
      sidebarCollapsed: 'Contraer barra lateral',
      devMode: 'Modo desarrollador',
      devModeHint: 'Haz clic varias veces en el número de versión en Acerca de para revelar esto.'
    },
    updates: {
      title: 'Actualizaciones',
      currentVersion: 'Versión actual',
      checkNow: 'Comprobar ahora',
      checking: 'Buscando actualizaciones…',
      upToDate: 'Estás al día.',
      available: 'Actualización {version} encontrada — descargando en segundo plano.',
      downloading: 'Descargando actualización… {percent}%',
      ready: 'Actualización lista.',
      readyHint: 'Se instalará sola la próxima vez que cierres el launcher — no hace falta hacer nada.',
      error: 'No se ha podido comprobar si hay actualizaciones: {message}'
    },
    about: {
      title: 'Acerca de',
      forkNotice: 'HellMC Client es un fork de HeliosLauncher de Daniel D. Scalzi (licencia MIT).',
      coreNotice: 'Usa HellMC-Core, un fork modificado de helios-core (LGPL-3.0).',
      nebulaNotice: 'Servidor de distribución basado en Nebula (Daniel D. Scalzi, MIT).',
      thirdPartyLicenses: 'Licencias de terceros',
      website: 'Web',
      source: 'Código fuente',
      support: 'Soporte'
    }
  },
  home: {
    title: 'Inicio',
    loadingDistro: 'Cargando distribución…',
    noServer: 'Sin servidor',
    noVersionAvailable: 'No hay ninguna versión disponible',
    playingAs: 'Jugando como {name}',
    play: 'Jugar',
    cancel: 'Cancelar',
    noAccount: 'Añade una cuenta sin conexión para empezar a jugar.',
    offlineUsernamePlaceholder: 'Nombre de usuario',
    addOfflineAccount: 'Añadir cuenta',
    phase: {
      idle: 'Inactivo',
      starting: 'Iniciando…',
      'refreshing-distribution': 'Comprobando actualizaciones…',
      'validating-account': 'Validando cuenta…',
      'verifying-files': 'Verificando archivos…',
      downloading: 'Descargando…',
      launching: 'Iniciando el juego…',
      ready: 'Iniciado',
      closed: 'Cerrado',
      error: 'Error'
    }
  },
  servers: {
    playWithoutServer: 'Jugar sin servidor',
    playWithoutServerDesc: 'Elige una versión y juega en local o en cualquier servidor.',
    empty: 'Aún no hay servidores publicados.',
    versionsCount: '{count} versiones'
  },
  serverDetail: {
    notFound: 'Servidor no encontrado.',
    back: 'Volver a servidores',
    version: 'Versión',
    recommended: 'recomendada'
  },
  versions: {
    empty: 'Aún no hay versiones publicadas.',
    install: 'Instalar',
    installed: 'Instalada',
    notInstalled: 'No instalada',
    updateAvailable: 'Actualización disponible'
  },
  versionDetail: {
    notFound: 'Versión no encontrada.',
    back: 'Volver a versiones',
    verify: 'Verificar',
    uninstall: 'Desinstalar',
    uninstallConfirm: {
      title: '¿Desinstalar esta versión?',
      message: 'Esto libera {size} de disco. Se eliminan mods, librerías y configuración gestionada; se conservan tus partidas, capturas y opciones.',
      confirm: 'Desinstalar',
      cancel: 'Cancelar'
    },
    changelog: 'Cambios',
    tabs: {
      summary: 'Resumen',
      mods: 'Mods',
      java: 'Java y memoria',
      files: 'Archivos'
    },
    files: {
      path: 'Carpeta de la instancia',
      openFolder: 'Abrir carpeta',
      size: 'Tamaño en disco',
      notInstalled: 'Aún no instalada — aquí es donde se instalará.'
    },
    mods: {
      search: 'Buscar mods…',
      count: '{enabled} de {total} activados',
      required: 'Obligatorio',
      blocked: 'No se puede desactivar: lo necesitan {list}.',
      alsoEnabled: 'También se han activado (los necesita): {list}.',
      alsoDisabled: 'También se han desactivado (ya no los necesita nadie): {list}.',
      andMore: 'y {count} más',
      empty: 'Esta versión no tiene mods.'
    },
    dataSharing: {
      title: 'Compartir mundos, packs de recursos y opciones con otras versiones',
      help: 'Los mundos, texturas, shaders, capturas y opciones se comparten con las demás versiones que también lo tengan activado. Los mods y su configuración siempre se quedan separados por versión.',
      changeNotice: 'Este cambio se aplicará la próxima vez que juegues con esta versión.',
      forcedNotice: 'Esta versión siempre tiene sus propios datos.',
      forcedTooltip: 'El administrador del servidor ha fijado que esta versión nunca comparta datos con las demás.'
    },
    java: {
      executable: 'Ejecutable de Java',
      notConfigured: 'No configurado',
      noneFound: 'No se ha encontrado ninguna instalación de Java compatible.',
      detecting: 'Detectando…',
      autoDetect: 'Detectar automáticamente',
      chooseManually: 'Elegir manualmente',
      downloadAuto: 'Descargar Java automáticamente',
      downloading: 'Descargando Java…',
      downloadFailed: 'La descarga de Java ha fallado. Inténtalo de nuevo o elige una instalación de Java manualmente.',
      phase: {
        fetchingJdk: 'Buscando la versión adecuada…',
        downloadingJava: 'Descargando Java',
        extractingJava: 'Extrayendo…'
      },
      minRam: 'RAM mínima',
      maxRam: 'RAM máxima'
    }
  },
  news: {
    title: 'Noticias',
    loading: 'Cargando noticias…',
    offlineCache: 'Mostrando noticias en caché (sin conexión).',
    filterAll: 'Todas',
    global: 'Global',
    back: 'Volver a noticias',
    openWeb: 'Abrir en la web',
    refresh: 'Actualizar',
    empty: 'Aún no hay noticias.',
    offlineBanner: 'Últimas noticias descargadas: {date}'
  },
  instances: {
    running: '{count} en marcha',
    forceClose: 'Forzar cierre',
    confirmTitle: '¿Forzar el cierre de esta instancia?',
    confirmMessage: 'Esto cerrará {version} inmediatamente. Se perderá cualquier progreso no guardado.',
    confirmForceClose: 'Sí, forzar cierre',
    cancel: 'Cancelar'
  }
}

export default es
