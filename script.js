document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const menuVideoElement = document.getElementById('menu-video-element');
    const transitionVideoElement = document.getElementById('transition-video-element'); 
    const slideVideoBuffer1 = document.getElementById('slide-video-buffer-1');
    const slideVideoBuffer2 = document.getElementById('slide-video-buffer-2');
    let currentSlideVideoElement = slideVideoBuffer1; 
    let nextSlideVideoElement = slideVideoBuffer2;    

    const menuVideoLayer = document.getElementById('menu-video-layer');
    const transitionVideoLayer = document.getElementById('transition-video-layer'); 
    const slideVideoLayer = document.getElementById('slide-video-layer'); 

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
    let currentVisibleVideo = menuVideoElement; 
    let currentUiLayer = introLayer;
    let pendingAction = null;
    let isTransitioning = false; 
    let activeCircleButton = null;   
    let activeTextBlock = null;    
    let currentSlideId = null;     
    let targetSlideAfterTransition = null; 

    // --- Funciones de Video y Transición ---
    async function playVideo(videoElement, loop = false) { 
        if (videoElement) {
            videoElement.currentTime = 0;
            videoElement.loop = loop;
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
    
    async function prepareVideoElement(videoEl, src) {
        return new Promise(async (resolve, reject) => {
            if (!videoEl) { reject(new Error(`prepareVideoElement: videoEl es null (intentando cargar ${src})`)); return; }
            if (!src) { 
                console.warn(`[prepareVideoElement] src es null para ${videoEl.id}. Resolviendo.`);
                resolve(); 
                return; 
            }

            let sourceTag = videoEl.querySelector('source');
            if (!sourceTag) {
                sourceTag = document.createElement('source');
                sourceTag.type = 'video/mp4';
                videoEl.appendChild(sourceTag);
            }
            
            const currentFullSrc = (sourceTag.getAttribute('src')) ? new URL(sourceTag.getAttribute('src'), document.baseURI).href : "";
            const newFullSrc = new URL(src, document.baseURI).href;

            if (currentFullSrc !== newFullSrc || videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
                sourceTag.setAttribute('src', src);
                videoEl.load(); 
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
            if (!videoElement) { console.error("[ensureVideoCanPlay] Video element es null"); reject(new Error("Video element es null")); return; }
            const sourceEl = videoElement.querySelector('source');
            let videoSrc = videoElement.currentSrc; 
            if (sourceEl && sourceEl.src) { 
                videoSrc = new URL(sourceEl.src, document.baseURI).href;
            }
            
            if (!videoSrc && !(videoElement.getAttribute('src'))) { 
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
                    console.error(`[ensureVideoCanPlay] Error cargando ${videoElement.id} (src: ${videoSrc || videoElement.getAttribute('src')}):`, videoElement.error, e);
                    videoElement.removeEventListener('canplaythrough', canPlayThroughHandler); 
                    videoElement.removeEventListener('error', errorHandler);
                    reject(videoElement.error || e); 
                };
                videoElement.addEventListener('canplaythrough', canPlayThroughHandler, { once: true });
                videoElement.addEventListener('error', errorHandler, { once: true });
                
                if (videoSrc && (videoElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || videoElement.readyState < HTMLMediaElement.HAVE_METADATA || videoElement.networkState === HTMLMediaElement.NETWORK_IDLE)) {
                     videoElement.load();
                }
            }
        });
    }

    async function onVideoEnded() { 
        const endedVideo = this;
        console.log(`[onVideoEnded] Video ${endedVideo.id} finalizado. pendingAction:`, pendingAction ? pendingAction.type : "null");

        if (!pendingAction) {
            console.warn(`[onVideoEnded] ${endedVideo.id} terminó, pero no hay acción pendiente.`);
            if (!endedVideo.loop && endedVideo === currentVisibleVideo && !isTransitioning) {
                 endedVideo.loop = true;
                 playVideo(endedVideo, true);
            }
            return;
        }

        const actionToExecute = pendingAction; 
        pendingAction = null; 

        try {
            if (endedVideo === transitionVideoElement) {
                transitionVideoLayer.classList.remove('active');
                transitionVideoElement.classList.remove('visible');
                pauseVideo(transitionVideoElement);

                if (actionToExecute.type === 'PLAY_SLIDE_AFTER_ENTRY_TRANSITION' && targetSlideAfterTransition) {
                    await prepareAndShowTargetSlide(targetSlideAfterTransition.slideId, targetSlideAfterTransition.slideAnimation);
                    targetSlideAfterTransition = null; 
                } else if (actionToExecute.type === 'SHOW_MENU_AFTER_EXIT_TRANSITION') {
                    actuallyShowMenuUi();
                } else if (actionToExecute.type === 'PLAY_SLIDE_AFTER_SLIDE_TRANSITION' && targetSlideAfterTransition) {
                    // Nueva lógica para después de transición slide-a-slide
                    await prepareAndShowTargetSlide(targetSlideAfterTransition.slideId, targetSlideAfterTransition.slideAnimation);
                    targetSlideAfterTransition = null;
                } else {
                    console.warn(`[onVideoEnded] Video de transición terminó, pero la acción pendiente (${actionToExecute.type}) no coincide o targetSlide es nulo.`);
                    setControlsWaitingState(false); 
                }
            } else if ((endedVideo === slideVideoBuffer1 || endedVideo === slideVideoBuffer2) && actionToExecute.type === 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP') {
                // Este caso es para cuando se usa el doble buffer sin un video de transición intermedio.
                await swapAndPlayNextSlideVideo(actionToExecute); 
            } else {
                await executeStandardPendingAction(actionToExecute); 
            }
        } catch (error) {
            console.error(`[onVideoEnded] Error durante la ejecución post-video-ended:`, error);
            setControlsWaitingState(false); 
        }
    }
    
    async function swapAndPlayNextSlideVideo(action) { 
        currentSlideVideoElement.classList.remove('visible');
        currentSlideVideoElement.loop = false; 
        pauseVideo(currentSlideVideoElement);

        nextSlideVideoElement.classList.add('visible');
        nextSlideVideoElement.loop = true; 
        
        currentVisibleVideo = nextSlideVideoElement; 
        await playVideo(currentVisibleVideo, true); 

        const temp = currentSlideVideoElement;
        currentSlideVideoElement = nextSlideVideoElement;
        nextSlideVideoElement = temp;

        actuallyShowSlideUi(action.slideId, false); 
    }

    async function executeStandardPendingAction(action) { 
        let videoToPrepare = null;
        if (action.type === 'INTRO_TO_MENU' || action.type === 'MENU_TO_INTRO' || action.type === 'SLIDE_TO_MENU_NO_TRANSITION') {
            videoToPrepare = menuVideoElement;
        } else if (action.type === 'MENU_TO_SLIDE_NO_TRANSITION') {
            videoToPrepare = currentSlideVideoElement; 
             try {
                await prepareVideoElement(videoToPrepare, action.slideAnimation);
            } catch (error) {
                console.error(`Error preparando video para MENU_TO_SLIDE_NO_TRANSITION:`, error);
                setControlsWaitingState(false); 
                return;
            }
        }

        if (videoToPrepare) {
            try {
                await ensureVideoCanPlay(videoToPrepare);
            } catch(e) {
                console.error(`Error en ensureVideoCanPlay para executeStandardPendingAction:`, e);
            }
        }
                
        if (action.type === 'INTRO_TO_MENU') actuallyShowMenuUi();
        else if (action.type === 'MENU_TO_INTRO') actuallyShowIntroUi();
        else if (action.type === 'SLIDE_TO_MENU_NO_TRANSITION') actuallyShowMenuUi();
        else if (action.type === 'MENU_TO_SLIDE_NO_TRANSITION') actuallyShowSlideUi(action.slideId, true);
    }

    async function prepareAndShowTargetSlide(slideId, slideAnimation) {
        try {
            await prepareVideoElement(currentSlideVideoElement, slideAnimation);
            actuallyShowSlideUi(slideId, true); 
        } catch (error) {
            console.error("Error al preparar y mostrar el slide de destino:", error);
            setControlsWaitingState(false); 
        }
    }

    function setControlsWaitingState(waiting) {
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

    async function transitionToState(action) { 
        console.log(`[transitionToState] Solicitada acción: ${action.type}`, action);
        if (isTransitioning && pendingAction) {
            if (pendingAction.type === action.type && 
                (pendingAction.animationSrc === action.animationSrc || 
                 pendingAction.entryTransition === action.entryTransition ||
                 pendingAction.exitTransition === action.exitTransition ||
                 pendingAction.slideTransitionVideo === action.slideTransitionVideo)) {
                console.warn("[transitionToState] Transición idéntica ya en curso o pendiente. Ignorando.");
                return; 
            }
            console.warn("[transitionToState] Transición ya en curso con acción PENDIENTE DIFERENTE. La nueva acción podría no procesarse como se espera.");
            // Considerar si cancelar la acción pendiente actual o encolar. Por ahora, la nueva acción puede ser ignorada si isTransitioning es true.
             return; // Evitar iniciar una nueva transición si ya hay una.
        }
        
        setControlsWaitingState(true); 
        pendingAction = action; 

        if (menuInfoTextBlock.classList.contains('visible')) {
            menuInfoTextBlock.classList.remove('visible');
            menuInfoButton.classList.remove('active');
        }
        
        let videoToWaitFor = currentVisibleVideo; 
        let videoToPlayAfterInitialEnd = null; 
        let loopForVideoAfterInitialEnd = false;
        let subsequentPendingAction = null; 

        if (action.type === 'MENU_TO_SLIDE_WITH_TRANSITION') {
            videoToWaitFor = menuVideoElement; 
            videoToPlayAfterInitialEnd = transitionVideoElement;
            targetSlideAfterTransition = { slideId: action.slideId, slideAnimation: action.slideAnimation };
            await prepareVideoElement(transitionVideoElement, action.entryTransition);
            loopForVideoAfterInitialEnd = false; 
            subsequentPendingAction = { type: 'PLAY_SLIDE_AFTER_ENTRY_TRANSITION' };
        } else if (action.type === 'SLIDE_TO_MENU_WITH_TRANSITION') {
            videoToWaitFor = currentSlideVideoElement; 
            videoToPlayAfterInitialEnd = transitionVideoElement;
            await prepareVideoElement(transitionVideoElement, action.exitTransition);
            loopForVideoAfterInitialEnd = false;
            subsequentPendingAction = { type: 'SHOW_MENU_AFTER_EXIT_TRANSITION' };
        } else if (action.type === 'SLIDE_TO_SLIDE_WITH_TRANSITION') { // NUEVO TIPO DE ACCIÓN
            videoToWaitFor = currentSlideVideoElement;
            videoToPlayAfterInitialEnd = transitionVideoElement;
            targetSlideAfterTransition = { slideId: action.nextSlideId, slideAnimation: action.nextSlideAnimation };
            await prepareVideoElement(transitionVideoElement, action.slideTransitionVideo);
            loopForVideoAfterInitialEnd = false;
            subsequentPendingAction = { type: 'PLAY_SLIDE_AFTER_SLIDE_TRANSITION' };
        }
        // SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP (antes SLIDE_TO_SLIDE_VIA_BUFFER) ya no usa videoToPlayAfterInitialEnd aquí,
        // sino que precarga nextSlideVideoElement y el swap ocurre en onVideoEnded del currentSlideVideoElement.
        else if (action.type === 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP') { 
            videoToWaitFor = currentSlideVideoElement;
            await prepareVideoElement(nextSlideVideoElement, action.animationSrc);
            // pendingAction se mantiene como SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP
        } else { 
             if (action.type === 'MENU_TO_INTRO') videoToWaitFor = menuVideoElement;
             else if (action.type === 'INTRO_TO_MENU') videoToWaitFor = menuVideoElement;
             else if (action.type === 'SLIDE_TO_MENU_NO_TRANSITION') videoToWaitFor = currentSlideVideoElement;
        }
        
        if (videoToWaitFor && (videoToWaitFor.currentSrc || (videoToWaitFor.querySelector('source') && videoToWaitFor.querySelector('source').src)) ) { 
            if (videoToWaitFor.loop) videoToWaitFor.loop = false; 
            videoToWaitFor.removeEventListener('ended', onVideoEnded); 
            videoToWaitFor.addEventListener('ended', 
                async function handleInitialEnd() { 
                    if (videoToPlayAfterInitialEnd) {
                        if (subsequentPendingAction) {
                            pendingAction = subsequentPendingAction; 
                        }
                        menuVideoLayer.classList.remove('active');
                        slideVideoLayer.classList.remove('active');
                        pauseVideo(menuVideoElement); 
                        pauseVideo(slideVideoBuffer1);
                        pauseVideo(slideVideoBuffer2);
                        
                        transitionVideoLayer.classList.add('active');
                        transitionVideoElement.classList.add('visible');
                        
                        transitionVideoElement.removeEventListener('ended', onVideoEnded); 
                        transitionVideoElement.addEventListener('ended', onVideoEnded, { once: true });
                        await playVideo(videoToPlayAfterInitialEnd, loopForVideoAfterInitialEnd); 
                    } else {
                        onVideoEnded.call(this); 
                    }
                }, 
            { once: true });
            
            if (videoToWaitFor.paused || videoToWaitFor.ended || 
                (videoToWaitFor.duration > 0 && videoToWaitFor.currentTime >= videoToWaitFor.duration - 0.1)) { 
                videoToWaitFor.dispatchEvent(new Event('ended')); 
            }
        } else { 
             if (videoToPlayAfterInitialEnd) { 
                 if (subsequentPendingAction) {
                    pendingAction = subsequentPendingAction;
                 }
                menuVideoLayer.classList.remove('active');
                slideVideoLayer.classList.remove('active');
                transitionVideoLayer.classList.add('active');
                transitionVideoElement.classList.add('visible');
                
                transitionVideoElement.removeEventListener('ended', onVideoEnded); 
                transitionVideoElement.addEventListener('ended', onVideoEnded, { once: true });
                await playVideo(videoToPlayAfterInitialEnd, loopForVideoAfterInitialEnd);
            } else {
                onVideoEnded.call(videoToWaitFor || {}); 
            }
        }
    }
    
    function hideAllTextBlocksForCurrentSlide() {
        // ... (Sin cambios)
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
        // ... (Sin cambios)
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
        // ... (Sin cambios)
        if (isTransitioning || menuInfoButton.classList.contains('waiting')) return;
        menuInfoTextBlock.classList.toggle('visible');
        menuInfoButton.classList.toggle('active', menuInfoTextBlock.classList.contains('visible'));
    });

    function ensureNoActiveSlideElements() {
        // ... (Sin cambios)
        hideAllTextBlocksForCurrentSlide(); 
        document.querySelectorAll('.slide-specific-content.active').forEach(ssc => ssc.classList.remove('active'));
        if (slideInteractiveElements) slideInteractiveElements.style.display = 'none';
        if (slideBackToMenuButton) slideBackToMenuButton.style.display = 'none';
        currentSlideId = null; 
    }

    function actuallyShowIntroUi() {
        // ... (Sin cambios)
        currentUiLayer.classList.remove('active');
        introLayer.classList.add('active');
        currentUiLayer = introLayer;

        slideVideoLayer.classList.remove('active'); 
        transitionVideoLayer.classList.remove('active');
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        pauseVideo(transitionVideoElement);
        slideVideoBuffer1.classList.remove('visible');
        slideVideoBuffer2.classList.remove('visible');
        transitionVideoElement.classList.remove('visible');

        menuVideoLayer.classList.add('active');
        menuVideoElement.classList.add('blurred'); 
        currentVisibleVideo = menuVideoElement; 
        playVideo(currentVisibleVideo, true);
        
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
        // ... (Sin cambios)
        currentUiLayer.classList.remove('active');
        uiOverlayLayer.classList.add('active');    
        currentUiLayer = uiOverlayLayer;

        slideVideoLayer.classList.remove('active');
        transitionVideoLayer.classList.remove('active');
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        pauseVideo(transitionVideoElement);
        slideVideoBuffer1.classList.remove('visible');
        slideVideoBuffer2.classList.remove('visible');
        transitionVideoElement.classList.remove('visible');

        menuVideoElement.classList.remove('blurred'); 
        menuVideoLayer.classList.add('active');
        currentVisibleVideo = menuVideoElement;
        playVideo(currentVisibleVideo, true);
        
        menuButtonsArea.style.display = 'flex'; 
        menuInfoButton.style.display = 'block'; 
        menuBackToIntroButton.style.display = 'block';
        ensureNoActiveSlideElements(); 
        
        uiOverlayLayer.style.justifyContent = 'center'; 
        uiOverlayLayer.style.alignItems = 'center';
        setControlsWaitingState(false);
    }

    function actuallyShowSlideUi(slideId, isInitialSlideTransition = true) {
        // ... (Sin cambios)
        if (currentSlideId && currentSlideId !== slideId && isInitialSlideTransition) { 
            hideAllTextBlocksForCurrentSlide(); 
            const prevSlideContent = document.querySelector(`.slide-specific-content[data-content-for-slide="${currentSlideId}"]`);
            if (prevSlideContent) prevSlideContent.classList.remove('active');
        }
        currentSlideId = slideId; 

        currentUiLayer.classList.remove('active');
        uiOverlayLayer.classList.add('active');    
        currentUiLayer = uiOverlayLayer;

        menuVideoLayer.classList.remove('active'); 
        transitionVideoLayer.classList.remove('active'); 
        pauseVideo(menuVideoElement);
        pauseVideo(transitionVideoElement);
        transitionVideoElement.classList.remove('visible');
        
        slideVideoLayer.classList.add('active'); 
        
        if (isInitialSlideTransition) { 
            slideVideoBuffer1.classList.remove('visible'); 
            slideVideoBuffer2.classList.remove('visible');
            currentSlideVideoElement.classList.add('visible'); 
            currentVisibleVideo = currentSlideVideoElement; 
            playVideo(currentVisibleVideo, true); 
        }
        
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
        
        if (isInitialSlideTransition) hideAllTextBlocksForCurrentSlide(); 

        uiOverlayLayer.style.justifyContent = 'flex-start'; 
        uiOverlayLayer.style.alignItems = 'flex-start'; 
        setControlsWaitingState(false);
    }

    // --- Event Listeners Principales ---
    startExperienceButton.addEventListener('click', () => {
        if (isTransitioning || startExperienceButton.classList.contains('waiting')) return;
        transitionToState({ type: 'INTRO_TO_MENU' });
    });

    allMenuButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const slideId = button.dataset.slideId;
            const slideAnimation = button.dataset.animation; 
            const entryTransition = button.dataset.entryTransition; 

            if (slideId && slideAnimation && entryTransition) {
                transitionToState({ 
                    type: 'MENU_TO_SLIDE_WITH_TRANSITION', 
                    slideId: slideId,
                    slideAnimation: slideAnimation, 
                    entryTransition: entryTransition 
                });
            } else if (slideId && slideAnimation) { 
                transitionToState({ type: 'MENU_TO_SLIDE_NO_TRANSITION', slideId: slideId, slideAnimation: slideAnimation });
            }
        });
    });

    slideBackToMenuButton.addEventListener('click', () => {
        if (isTransitioning || slideBackToMenuButton.classList.contains('waiting')) return;
        
        const menuButtonForCurrentSlide = document.querySelector(`.menu-button[data-slide-id="${currentSlideId}"]`);
        const exitTransition = menuButtonForCurrentSlide ? menuButtonForCurrentSlide.dataset.exitTransition : null;
        
        if (exitTransition) {
            transitionToState({ 
                type: 'SLIDE_TO_MENU_WITH_TRANSITION', 
                exitTransition: exitTransition 
            });
        } else { 
            currentVisibleVideo = currentSlideVideoElement; 
            transitionToState({ type: 'SLIDE_TO_MENU_NO_TRANSITION' });
        }
    });

    menuBackToIntroButton.addEventListener('click', () => {
        if (isTransitioning || menuBackToIntroButton.classList.contains('waiting')) return;
        transitionToState({ type: 'MENU_TO_INTRO' });
    });

    allSlideNextButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const nextSlideId = button.dataset.nextSlideId;
            const nextAnimationPath = button.dataset.nextAnimation; // Video de fondo del siguiente slide
            const slideTransitionVideo = button.dataset.transitionVideo; // Video de transición slide-a-slide

            if (nextSlideId && nextAnimationPath && slideTransitionVideo) {
                transitionToState({ 
                    type: 'SLIDE_TO_SLIDE_WITH_TRANSITION', 
                    nextSlideId: nextSlideId,
                    nextSlideAnimation: nextAnimationPath,
                    slideTransitionVideo: slideTransitionVideo
                });
            } else if (nextSlideId && nextAnimationPath) { // Fallback sin video de transición inter-slide
                transitionToState({ type: 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP', animationSrc: nextAnimationPath, slideId: nextSlideId });
            }
        });
    });

    allSlidePrevButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const prevSlideId = button.dataset.prevSlideId;
            const prevAnimationPath = button.dataset.prevAnimation; // Video de fondo del slide anterior
            const slideTransitionVideo = button.dataset.transitionVideo; // Video de transición slide-a-slide

            if (prevSlideId && prevAnimationPath && slideTransitionVideo) {
                transitionToState({ 
                    type: 'SLIDE_TO_SLIDE_WITH_TRANSITION',
                    nextSlideId: prevSlideId, // El "siguiente" slide en este caso es el anterior
                    nextSlideAnimation: prevAnimationPath,
                    slideTransitionVideo: slideTransitionVideo
                });
            } else if (prevSlideId && prevAnimationPath) { // Fallback
                transitionToState({ type: 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP', animationSrc: prevAnimationPath, slideId: prevSlideId });
            }
        });
    });

    async function initializeApp() {
        uiOverlayLayer.classList.remove('active');
        introLayer.classList.remove('active'); 
        ensureNoActiveSlideElements(); 
        menuBackToIntroButton.style.display = 'none';
        transitionVideoLayer.classList.remove('active'); 
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