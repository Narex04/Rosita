document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const menuVideoElement = document.getElementById('menu-video-element');
    // SLIDE VIDEOS - DOBLE BUFFER
    const slideVideoBuffer1 = document.getElementById('slide-video-buffer-1');
    const slideVideoBuffer2 = document.getElementById('slide-video-buffer-2');
    let currentSlideVideoElement = slideVideoBuffer1; // El que está actualmente visible o a punto de serlo
    let nextSlideVideoElement = slideVideoBuffer2;    // El que se usará para precargar el siguiente

    const menuVideoLayer = document.getElementById('menu-video-layer');
    const slideVideoLayer = document.getElementById('slide-video-layer'); // Contenedor de los buffers

    // ... (resto de las declaraciones de elementos DOM sin cambios)
    const introLayer = document.getElementById('intro-layer');
    const introContentWrapper = document.getElementById('intro-content-wrapper');
    const startExperienceButton = document.getElementById('start-experience-button');
    const uiOverlayLayer = document.getElementById('ui-overlay-layer');
    const menuButtonsArea = document.getElementById('menu-buttons-area');
    const allMenuButtons = document.querySelectorAll('.menu-button');
    const slideBackToMenuButton = document.getElementById('slide-back-to-menu-button');
    const menuBackToIntroButton = document.getElementById('menu-back-to-intro-button');
    const slideInteractiveElements = document.getElementById('slide-interactive-elements');
    const allSlideNextButtons = document.querySelectorAll('.slide-next-button');
    const allSlidePrevButtons = document.querySelectorAll('.slide-prev-button'); 
    const menuInfoButton = document.getElementById('menu-info-button');
    const menuInfoTextBlock = document.getElementById('menu-info-text-block');

    // --- Variables de Estado ---
    let currentVisibleVideo = menuVideoElement; // Video principal de la escena (menú o slide)
    let currentUiLayer = introLayer;
    let pendingAction = null;
    let isTransitioning = false; 
    let activeCircleButton = null;   
    let activeTextBlock = null;    
    let currentSlideId = null;     

    // --- Funciones de Video y Transición ---
    async function playVideo(videoElement) { 
        if (videoElement) {
            videoElement.currentTime = 0;
            try { 
                await videoElement.play(); 
            } 
            catch (error) { console.error(`[playVideo] Error para ${videoElement.id}:`, error, videoElement.currentSrc); }
        }
    }

    function pauseVideo(videoElement) { 
        if (videoElement && !videoElement.paused) {
            videoElement.pause();
        }
    }

    // Función para preparar un video específico (cargar src y esperar a que esté listo)
    async function prepareVideoElement(videoEl, src) {
        return new Promise(async (resolve, reject) => {
            if (!videoEl) { reject(new Error("prepareVideoElement: videoEl es null")); return; }
            if (!src) { reject(new Error("prepareVideoElement: src es null")); return; }

            let sourceTag = videoEl.querySelector('source');
            if (!sourceTag) {
                sourceTag = document.createElement('source');
                sourceTag.type = 'video/mp4';
                videoEl.appendChild(sourceTag);
            }
            
            const currentFullSrc = (sourceTag.getAttribute('src')) ? new URL(sourceTag.getAttribute('src'), document.baseURI).href : "";
            const newFullSrc = new URL(src, document.baseURI).href;

            if (currentFullSrc !== newFullSrc || videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
                console.log(`[prepareVideoElement] Estableciendo src de ${videoEl.id} a ${src}`);
                sourceTag.setAttribute('src', src);
                videoEl.load(); // Indispensable después de cambiar el src
            } else {
                 console.log(`[prepareVideoElement] ${videoEl.id} ya tiene el src ${src} y parece cargado.`);
            }
            
            try {
                await ensureVideoCanPlay(videoEl);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }


    async function ensureVideoCanPlay(videoElement) { 
        return new Promise((resolve, reject) => {
            // ... (lógica de ensureVideoCanPlay sin cambios, ya era robusta)
            if (!videoElement) { console.error("[ensureVideoCanPlay] Video element es null"); reject(new Error("Video element es null")); return; }
            const sourceEl = videoElement.querySelector('source');
            const videoSrc = (sourceEl && sourceEl.src) ? new URL(sourceEl.src, document.baseURI).href : videoElement.currentSrc;

            if (!videoSrc) {
                console.warn(`[ensureVideoCanPlay] ${videoElement.id} no tiene src válido. Resolviendo sin esperar.`);
                resolve(); 
                return;
            }
            if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                resolve();
            } else {
                const canPlayThroughHandler = () => { 
                    videoElement.removeEventListener('canplaythrough', canPlayThroughHandler); 
                    videoElement.removeEventListener('error', errorHandler);
                    resolve(); 
                };
                const errorHandler = (e) => { 
                    console.error(`[ensureVideoCanPlay] Error cargando ${videoElement.id} (src: ${videoSrc}):`, videoElement.error, e);
                    videoElement.removeEventListener('canplaythrough', canPlayThroughHandler); 
                    videoElement.removeEventListener('error', errorHandler);
                    reject(videoElement.error || e); 
                };
                videoElement.addEventListener('canplaythrough', canPlayThroughHandler, { once: true });
                videoElement.addEventListener('error', errorHandler, { once: true });
                
                if (videoElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE && videoSrc) {
                     videoElement.load();
                } else if (videoElement.readyState < HTMLMediaElement.HAVE_METADATA && videoSrc) {
                     videoElement.load();
                } else if (videoElement.networkState === HTMLMediaElement.NETWORK_IDLE && videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA && videoSrc){
                     videoElement.load();
                }
            }
        });
    }

    function onVideoEnded() { 
        const endedVideoId = currentVisibleVideo ? currentVisibleVideo.id : 'N/A';
        if (pendingAction) {
             // Si el video que terminó es el currentSlideVideoElement, y la acción es un SLIDE,
            // es la transición del doble buffer.
            if (currentVisibleVideo === currentSlideVideoElement && pendingAction.type === 'SLIDE') {
                console.log(`[onVideoEnded] ${endedVideoId} (slide) terminó. Swapping buffers para ${pendingAction.animationSrc}`);
                swapAndPlayNextSlideVideo();
            } else {
                // Transición normal (ej. menú a slide, slide a menú, intro a menú)
                console.log(`[onVideoEnded] ${endedVideoId} (no slide o no buffer swap) terminó. Ejecutando acción pendiente: ${pendingAction.type}`);
                executePendingAction();
            }
        } else if (currentVisibleVideo && !currentVisibleVideo.loop && 
                   (currentVisibleVideo === slideVideoBuffer1 || currentVisibleVideo === slideVideoBuffer2)) {
            // Si un video de slide (que no debería estar en loop para la transición) termina y NO hay pendingAction
            // esto podría indicar un problema o que simplemente se dejó un video sin loop.
            // Podríamos reiniciarlo o simplemente no hacer nada.
            console.warn(`[onVideoEnded] ${endedVideoId} (slide) terminó sin acción pendiente y sin loop. Considerar comportamiento.`);
        }
    }
    
    // Nueva función para manejar el cambio de buffers de video de slide
    async function swapAndPlayNextSlideVideo() {
        if (!pendingAction || pendingAction.type !== 'SLIDE') {
            console.error("swapAndPlayNextSlideVideo llamado sin acción de SLIDE válida.");
            setControlsWaitingState(false); // Desbloquear UI
            return;
        }
        
        const action = pendingAction;
        pendingAction = null; // Consumir la acción

        // El 'nextSlideVideoElement' ya debería estar preparado con el nuevo video
        // gracias a la lógica en 'transitionToState' cuando se va a un SLIDE.

        // Ocultar el video actual, mostrar el siguiente
        currentSlideVideoElement.classList.remove('visible');
        currentSlideVideoElement.loop = false; // Asegurar que no haga loop si se pausa
        pauseVideo(currentSlideVideoElement);

        nextSlideVideoElement.classList.add('visible');
        nextSlideVideoElement.loop = true; // El nuevo video principal sí debe loopear
        
        currentVisibleVideo = nextSlideVideoElement; // Actualizar el puntero global
        playVideo(currentVisibleVideo);

        // Intercambiar roles de los buffers
        const temp = currentSlideVideoElement;
        currentSlideVideoElement = nextSlideVideoElement;
        nextSlideVideoElement = temp;

        // Actualizar la UI del slide
        actuallyShowSlideUi(action.slideId, false); // false para no tocar los videos
    }


    async function executePendingAction() { // Ahora se usa para transiciones que NO son slide-a-slide
        if (!pendingAction) return;
        const action = pendingAction;
        
        let targetVideoElementForUiChange = menuVideoElement; 

        // Si la acción es ir a un SLIDE (desde menú o intro), preparamos el primer buffer de slide
        if (action.type === 'SLIDE') {
            targetVideoElementForUiChange = currentSlideVideoElement; // El que se va a mostrar
            try {
                await prepareVideoElement(currentSlideVideoElement, action.animationSrc);
                console.log(`[executePendingAction] Buffer ${currentSlideVideoElement.id} preparado para ${action.animationSrc}`);
            } catch (error) {
                console.error(`[executePendingAction] Error preparando ${currentSlideVideoElement.id} para SLIDE:`, error);
                pendingAction = null; 
                setControlsWaitingState(false);
                return; // No continuar si el video inicial del slide no se puede preparar
            }
        }
        
        pendingAction = null; // Consumir acción

        if (action.type === 'INTRO_TO_MENU') actuallyShowMenuUi();
        else if (action.type === 'MENU_TO_INTRO') actuallyShowIntroUi();
        else if (action.type === 'MENU') actuallyShowMenuUi();
        else if (action.type === 'SLIDE') actuallyShowSlideUi(action.slideId, true); // true para manejar el video inicial
    }

    function setControlsWaitingState(waiting) {
        // ... (sin cambios)
        isTransitioning = waiting;
        const mainControls = [
            ...allMenuButtons, 
            slideBackToMenuButton, 
            menuBackToIntroButton,
            startExperienceButton, 
            menuInfoButton,
            ...allSlideNextButtons,
            ...allSlidePrevButtons 
        ]; 
        mainControls.forEach(btn => btn.classList.toggle('waiting', waiting));
        
        if (currentSlideId) {
            const activeSlideContent = document.querySelector(`.slide-specific-content[data-content-for-slide="${currentSlideId}"].active`);
            if (activeSlideContent) {
                activeSlideContent.querySelectorAll('.circle-button').forEach(btn => {
                    btn.classList.toggle('waiting', waiting);
                });
            }
        }
    }

    async function transitionToState(actionAfterCurrentVideoEnds) { 
        // ... (lógica de transitionToState, pero ajustada para el doble buffer)
        if (isTransitioning && pendingAction && 
            pendingAction.type === actionAfterCurrentVideoEnds.type && 
            (pendingAction.animationSrc === actionAfterCurrentVideoEnds.animationSrc || !actionAfterCurrentVideoEnds.animationSrc) ) {
            return; 
        }
        
        setControlsWaitingState(true); 
        pendingAction = actionAfterCurrentVideoEnds;

        if (menuInfoTextBlock.classList.contains('visible')) {
            menuInfoTextBlock.classList.remove('visible');
            menuInfoButton.classList.remove('active');
        }
        
        let videoToWaitFor = currentVisibleVideo; 

        // Si la transición es a un SLIDE y ya estamos en un SLIDE (slide-a-slide)
        if (actionAfterCurrentVideoEnds.type === 'SLIDE' && currentUiLayer === uiOverlayLayer && slideVideoLayer.classList.contains('active')) {
            console.log(`[transitionToState] Slide-a-Slide detectado. Preparando nextSlideVideoElement (${nextSlideVideoElement.id}) para ${actionAfterCurrentVideoEnds.animationSrc}`);
            videoToWaitFor = currentSlideVideoElement; // El video actual del slide debe terminar
            try {
                // Precargar el *siguiente* video en el buffer que no está visible
                await prepareVideoElement(nextSlideVideoElement, actionAfterCurrentVideoEnds.animationSrc);
                console.log(`[transitionToState] ${nextSlideVideoElement.id} precargado con ${actionAfterCurrentVideoEnds.animationSrc}`);
                // El evento 'ended' del videoToWaitFor (currentSlideVideoElement) disparará swapAndPlayNextSlideVideo
            } catch (error) {
                console.error(`[transitionToState] Error precargando ${nextSlideVideoElement.id}:`, error);
                // Si falla la precarga, ¿qué hacer? Podríamos intentar una transición normal.
                // Por ahora, la transición se bloqueará si la precarga falla.
                setControlsWaitingState(false);
                pendingAction = null;
                return;
            }
        } else if (actionAfterCurrentVideoEnds.type === 'MENU_TO_INTRO') {
            videoToWaitFor = menuVideoElement;
        } else if (actionAfterCurrentVideoEnds.type === 'INTRO_TO_MENU') {
             videoToWaitFor = menuVideoElement;
        }
        // Para MENU a SLIDE, el videoToWaitFor es menuVideoElement (currentVisibleVideo)
        // Para SLIDE a MENU, el videoToWaitFor es currentSlideVideoElement (currentVisibleVideo)

        
        if (videoToWaitFor && videoToWaitFor.currentSrc && videoToWaitFor.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE) { 
            console.log(`[transitionToState] Esperando 'ended' de ${videoToWaitFor.id}`);
            if (videoToWaitFor.loop) videoToWaitFor.loop = false;
            videoToWaitFor.removeEventListener('ended', onVideoEnded); 
            videoToWaitFor.addEventListener('ended', onVideoEnded, { once: true });
            
            if (videoToWaitFor.paused || videoToWaitFor.ended || 
                (videoToWaitFor.duration > 0 && videoToWaitFor.currentTime >= videoToWaitFor.duration - 0.1)) { 
                onVideoEnded();
            }
        } else { 
            onVideoEnded(); 
        }
    }
    
    // ... (hideAllTextBlocksForCurrentSlide y listeners de botones círculo y menú info sin cambios)
    function hideAllTextBlocksForCurrentSlide() {
        if (!currentSlideId && !activeTextBlock && !activeCircleButton) return; 
        let slideContentToClean = null;
        if (currentSlideId) {
            slideContentToClean = document.querySelector(`.slide-specific-content[data-content-for-slide="${currentSlideId}"]`);
        } else if (activeCircleButton) { 
            slideContentToClean = activeCircleButton.closest('.slide-specific-content');
        }

        if (slideContentToClean) {
            slideContentToClean.querySelectorAll('.slide-main-interactive-area > .text-block.visible').forEach(block => block.classList.remove('visible'));
            slideContentToClean.querySelectorAll('.circle-button.active').forEach(btn => btn.classList.remove('active'));
        }
        activeCircleButton = null;
        activeTextBlock = null;
    }
    
    document.querySelectorAll('#slide-interactive-elements .circle-button').forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) {
                 return;
            }
            const parentSlideSpecificContent = button.closest('.slide-specific-content');
            if (!parentSlideSpecificContent || !parentSlideSpecificContent.classList.contains('active')) {
                return;
            }
            const targetId = button.getAttribute('data-text-target');
            const targetBlock = parentSlideSpecificContent.querySelector(`.slide-main-interactive-area > #${targetId}.text-block`);

            const currentlyActiveButtonInThisSlide = parentSlideSpecificContent.querySelector('.circle-button.active');
            const currentlyActiveTextBlockInThisSlide = parentSlideSpecificContent.querySelector('.slide-main-interactive-area > .text-block.visible');

            if (button.classList.contains('active')) { 
                if(targetBlock) targetBlock.classList.remove('visible');
                button.classList.remove('active');
                activeCircleButton = null; 
                activeTextBlock = null;  
            } else { 
                if (currentlyActiveTextBlockInThisSlide) currentlyActiveTextBlockInThisSlide.classList.remove('visible');
                if (currentlyActiveButtonInThisSlide) currentlyActiveButtonInThisSlide.classList.remove('active');

                if (targetBlock) {
                    targetBlock.classList.add('visible');
                    targetBlock.style.top = `${button.offsetTop}px`;
                    activeCircleButton = button; 
                    activeTextBlock = targetBlock; 
                    button.classList.add('active');
                }
            }
        });
    });
    
    menuInfoButton.addEventListener('click', () => {
        if (isTransitioning || menuInfoButton.classList.contains('waiting')) return;
        menuInfoTextBlock.classList.toggle('visible');
        menuInfoButton.classList.toggle('active', menuInfoTextBlock.classList.contains('visible'));
    });

    function ensureNoActiveSlideElements() {
        hideAllTextBlocksForCurrentSlide(); 
        document.querySelectorAll('.slide-specific-content.active').forEach(ssc => ssc.classList.remove('active'));
        if (slideInteractiveElements) slideInteractiveElements.style.display = 'none';
        if (slideBackToMenuButton) slideBackToMenuButton.style.display = 'none';
        currentSlideId = null; 
    }

    function actuallyShowIntroUi() {
        // ... (sin cambios respecto a la versión anterior)
        currentUiLayer.classList.remove('active');
        introLayer.classList.add('active');
        currentUiLayer = introLayer;

        slideVideoLayer.classList.remove('active'); // Ocultar capa de slides
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        slideVideoBuffer1.classList.remove('visible'); // Asegurar que buffers no estén visibles
        slideVideoBuffer2.classList.remove('visible');


        menuVideoLayer.classList.add('active');
        menuVideoElement.classList.add('blurred'); 
        currentVisibleVideo = menuVideoElement; // El video de menú es el principal ahora
        currentVisibleVideo.loop = true; 
        playVideo(currentVisibleVideo);
        
        uiOverlayLayer.classList.remove('active'); 
        ensureNoActiveSlideElements(); 
        menuInfoButton.style.display = 'none'; 
        menuInfoTextBlock.classList.remove('visible'); 
        menuBackToIntroButton.style.display = 'none';
        
        introContentWrapper.classList.remove('visible'); 
        setTimeout(() => { 
            introContentWrapper.classList.add('visible'); 
        }, 100); 
        setControlsWaitingState(false);
    }

    function actuallyShowMenuUi() {
        // ... (sin cambios respecto a la versión anterior)
        currentUiLayer.classList.remove('active');
        uiOverlayLayer.classList.add('active');    
        currentUiLayer = uiOverlayLayer;

        slideVideoLayer.classList.remove('active');
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        slideVideoBuffer1.classList.remove('visible');
        slideVideoBuffer2.classList.remove('visible');

        menuVideoElement.classList.remove('blurred'); 
        menuVideoLayer.classList.add('active');
        currentVisibleVideo = menuVideoElement;
        currentVisibleVideo.loop = true; 
        playVideo(currentVisibleVideo);
        
        menuButtonsArea.style.display = 'flex'; 
        menuInfoButton.style.display = 'block'; 
        menuBackToIntroButton.style.display = 'block';
        ensureNoActiveSlideElements(); 
        
        uiOverlayLayer.style.justifyContent = 'center'; 
        uiOverlayLayer.style.alignItems = 'center';
        setControlsWaitingState(false);
    }

    function actuallyShowSlideUi(slideId, isInitialSlideTransition = true) {
        // ... (ajustado para doble buffer)
        if (currentSlideId && currentSlideId !== slideId && isInitialSlideTransition) { // Limpiar solo si es una transición inicial, no un swap de buffer
            hideAllTextBlocksForCurrentSlide(); 
            const prevSlideContent = document.querySelector(`.slide-specific-content[data-content-for-slide="${currentSlideId}"]`);
            if (prevSlideContent) prevSlideContent.classList.remove('active');
        }
        currentSlideId = slideId; 

        currentUiLayer.classList.remove('active');
        uiOverlayLayer.classList.add('active');    
        currentUiLayer = uiOverlayLayer;

        menuVideoLayer.classList.remove('active'); // Ocultar capa de menú
        pauseVideo(menuVideoElement);
        
        slideVideoLayer.classList.add('active'); // Activar capa de videos de slide
        
        if (isInitialSlideTransition) { // Si es la primera vez que entramos a este slide (o desde menú/intro)
            // currentSlideVideoElement ya fue preparado y es el que se va a reproducir
            // nextSlideVideoElement está listo para la siguiente precarga
            slideVideoBuffer1.classList.remove('visible'); // Ocultar ambos por si acaso
            slideVideoBuffer2.classList.remove('visible');
            
            currentSlideVideoElement.classList.add('visible'); // Mostrar el buffer actual
            currentSlideVideoElement.loop = true;
            currentVisibleVideo = currentSlideVideoElement; // Actualizar puntero global
            playVideo(currentVisibleVideo);
        }
        // Si !isInitialSlideTransition, significa que es un swap de buffer,
        // y el video ya se está manejando/reproduciendo por swapAndPlayNextSlideVideo

        menuButtonsArea.style.display = 'none'; 
        menuInfoButton.style.display = 'none'; 
        menuInfoTextBlock.classList.remove('visible'); 
        menuInfoButton.classList.remove('active'); 
        menuBackToIntroButton.style.display = 'none';
        
        slideBackToMenuButton.style.display = 'block'; 
        slideInteractiveElements.style.display = 'flex'; 

        document.querySelectorAll('.slide-specific-content').forEach(content => {
            content.classList.remove('active');
        });
        const activeSlideContent = document.querySelector(`.slide-specific-content[data-content-for-slide="${slideId}"]`);
        if (activeSlideContent) {
            activeSlideContent.classList.add('active');
        } else {
            slideInteractiveElements.style.display = 'none'; 
        }
        
        if (isInitialSlideTransition) hideAllTextBlocksForCurrentSlide(); // Limpiar textos solo en transición inicial

        uiOverlayLayer.style.justifyContent = 'flex-start'; 
        uiOverlayLayer.style.alignItems = 'flex-start'; 
        setControlsWaitingState(false);
    }

    // --- Event Listeners Principales ---
    // ... (sin cambios respecto a la versión anterior)
    startExperienceButton.addEventListener('click', () => {
        if (isTransitioning || startExperienceButton.classList.contains('waiting')) return;
        transitionToState({ type: 'INTRO_TO_MENU' });
    });

    allMenuButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const animationPath = button.getAttribute('data-animation');
            const slideId = button.getAttribute('data-slide-id'); 
            if (animationPath) {
                transitionToState({ type: 'SLIDE', animationSrc: animationPath, slideId: slideId });
            }
        });
    });

    slideBackToMenuButton.addEventListener('click', () => {
        if (isTransitioning || slideBackToMenuButton.classList.contains('waiting')) return;
        ensureNoActiveSlideElements(); 
        // Al volver al menú, el video de slide actual (currentSlideVideoElement) es el que debe terminar.
        currentVisibleVideo = currentSlideVideoElement; 
        transitionToState({ type: 'MENU' });
    });

    menuBackToIntroButton.addEventListener('click', () => {
        if (isTransitioning || menuBackToIntroButton.classList.contains('waiting')) return;
        transitionToState({ type: 'MENU_TO_INTRO' });
    });

    allSlideNextButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const nextSlideId = button.dataset.nextSlideId;
            const nextAnimationPath = button.dataset.nextAnimation;
            if (nextSlideId && nextAnimationPath) {
                transitionToState({ type: 'SLIDE', animationSrc: nextAnimationPath, slideId: nextSlideId });
            }
        });
    });

    allSlidePrevButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const prevSlideId = button.dataset.prevSlideId;
            const prevAnimationPath = button.dataset.prevAnimation;
            if (prevSlideId && prevAnimationPath) {
                transitionToState({ type: 'SLIDE', animationSrc: prevAnimationPath, slideId: prevSlideId });
            }
        });
    });

    async function initializeApp() {
        // ... (sin cambios)
        uiOverlayLayer.classList.remove('active');
        introLayer.classList.remove('active'); 
        ensureNoActiveSlideElements(); 
        menuBackToIntroButton.style.display = 'none';
        try {
            if (menuVideoElement.querySelector('source') && menuVideoElement.querySelector('source').src) {
                 await ensureVideoCanPlay(menuVideoElement);
            }
            actuallyShowIntroUi();
        } catch (e) {
            console.error("[initializeApp] Error inicializando:", e);
            actuallyShowIntroUi(); 
        }
    }
    initializeApp();
});