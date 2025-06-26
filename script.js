document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    // ... (sin cambios en las declaraciones de elementos)
    const menuVideoElement = document.getElementById('menu-video-element');
    const transitionVideoElement = document.getElementById('transition-video-element'); 
    const slideVideoBuffer1 = document.getElementById('slide-video-buffer-1');
    const slideVideoBuffer2 = document.getElementById('slide-video-buffer-2');
    let currentSlideVideoElement = slideVideoBuffer1; 
    let nextSlideVideoElement = slideVideoBuffer2;    
    const menuVideoLayer = document.getElementById('menu-video-layer');
    const transitionVideoLayer = document.getElementById('transition-video-layer'); 
    const slideVideoLayer = document.getElementById('slide-video-layer'); 
    const staticFrameImage = document.getElementById('static-frame-image'); 
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
    // ... (sin cambios)
    let currentVisibleVideo = menuVideoElement; 
    let currentUiLayer = introLayer;
    let pendingAction = null;
    let isTransitioning = false; 
    let activeCircleButton = null;   
    let activeTextBlock = null;    
    let currentSlideId = null;     
    let targetSlideAfterTransition = null; 
    const FADE_DELAY = 30; 

    // --- Funciones de Video y Transición ---
    // ... (playVideo, pauseVideo, prepareVideoElement, ensureVideoCanPlay sin cambios)
    async function playVideo(videoElement, loop = false) { 
        if (videoElement) {
            if (videoElement.loop === true && loop === true && !videoElement.paused) {
                return;
            }
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
                resolve(); return; 
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
            if (!videoElement) { reject(new Error("Video element es null")); return; }
            const sourceEl = videoElement.querySelector('source');
            let videoSrc = videoElement.currentSrc; 
            if (sourceEl && sourceEl.src) { 
                videoSrc = new URL(sourceEl.src, document.baseURI).href;
            }
            if (!videoSrc && !(videoElement.getAttribute('src'))) { 
                resolve(); return;
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
        // ... (sin cambios)
        const endedVideo = this;
        if (!pendingAction) {
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
                let finalScenePromise;
                if (actionToExecute.type === 'PLAY_SLIDE_AFTER_ENTRY_TRANSITION' && targetSlideAfterTransition) {
                    finalScenePromise = prepareAndShowTargetSlide(targetSlideAfterTransition.slideId, targetSlideAfterTransition.slideAnimation, true);
                    targetSlideAfterTransition = null; 
                } else if (actionToExecute.type === 'SHOW_MENU_AFTER_EXIT_TRANSITION') {
                    finalScenePromise = Promise.resolve(actuallyShowMenuUi(true));
                } else if (actionToExecute.type === 'PLAY_SLIDE_AFTER_SLIDE_TRANSITION' && targetSlideAfterTransition) {
                    finalScenePromise = prepareAndShowTargetSlide(targetSlideAfterTransition.slideId, targetSlideAfterTransition.slideAnimation, true);
                    targetSlideAfterTransition = null;
                } else {
                    setControlsWaitingState(false); 
                    finalScenePromise = Promise.resolve();
                }
                await finalScenePromise;
                requestAnimationFrame(() => {
                    transitionVideoLayer.classList.remove('active');
                    transitionVideoElement.classList.remove('visible');
                    pauseVideo(transitionVideoElement);
                });

            } else if ((endedVideo === slideVideoBuffer1 || endedVideo === slideVideoBuffer2) && actionToExecute.type === 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP') {
                await swapAndPlayNextSlideVideo(actionToExecute); 
            } else {
                if (actionToExecute.type !== 'IMMEDIATE_INTRO_TO_MENU' && actionToExecute.type !== 'IMMEDIATE_MENU_TO_INTRO') {
                    await executeStandardPendingAction(actionToExecute); 
                } else {
                    if (!isTransitioning) setControlsWaitingState(false);
                }
            }
        } catch (error) {
            console.error(`[onVideoEnded] Error:`, error);
            setControlsWaitingState(false); 
        }
    }
    
    async function swapAndPlayNextSlideVideo(action) { 
        // ... (sin cambios)
        const oldSlideVideo = currentSlideVideoElement;
        const newSlideVideo = nextSlideVideoElement;
        slideVideoLayer.classList.add('active'); 
        newSlideVideo.classList.add('visible');
        newSlideVideo.loop = true; 
        currentVisibleVideo = newSlideVideo; 
        await playVideo(currentVisibleVideo, true); 
        setTimeout(() => {
            oldSlideVideo.classList.remove('visible');
            oldSlideVideo.loop = false; 
            pauseVideo(oldSlideVideo);
        }, FADE_DELAY);
        currentSlideVideoElement = newSlideVideo;
        nextSlideVideoElement = oldSlideVideo;
        actuallyShowSlideUi(action.slideId, false); 
    }

    async function executeStandardPendingAction(action) { 
        // ... (sin cambios)
        let videoToPrepare = null;
        if (action.type === 'SLIDE_TO_MENU_NO_TRANSITION') { 
            videoToPrepare = menuVideoElement;
        } else if (action.type === 'MENU_TO_SLIDE_NO_TRANSITION') { 
            videoToPrepare = currentSlideVideoElement; 
             try {
                await prepareVideoElement(videoToPrepare, action.slideAnimation);
            } catch (error) {
                setControlsWaitingState(false); 
                return;
            }
        }

        if (videoToPrepare) {
            try {
                await ensureVideoCanPlay(videoToPrepare);
                if(videoToPrepare === menuVideoElement) menuVideoLayer.classList.add('active');
                else if (videoToPrepare === currentSlideVideoElement) {
                     slideVideoLayer.classList.add('active'); 
                     currentSlideVideoElement.classList.add('visible'); 
                }
            } catch(e) {
                console.error(`Error en ensureVideoCanPlay para executeStandardPendingAction:`, e);
            }
        }
                
        if (action.type === 'SLIDE_TO_MENU_NO_TRANSITION') actuallyShowMenuUi();
        else if (action.type === 'MENU_TO_SLIDE_NO_TRANSITION') actuallyShowSlideUi(action.slideId, true);
    }

    async function prepareAndShowTargetSlide(slideId, slideAnimation, comingFromTransitionVideo = false) {
        // ... (sin cambios)
        try {
            if (comingFromTransitionVideo) {
                slideVideoLayer.classList.add('active'); 
            }
            await prepareVideoElement(currentSlideVideoElement, slideAnimation); 
            actuallyShowSlideUi(slideId, true); 
        } catch (error) {
            setControlsWaitingState(false); 
        }
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

    // Función para cerrar el panel de información del menú si está abierto
    function closeMenuInfoPanel() {
        if (menuInfoTextBlock.classList.contains('visible')) {
            menuInfoTextBlock.classList.remove('visible');
            menuInfoButton.classList.remove('active');
        }
    }

    async function transitionToState(action) { 
        // CERRAR PANELES DE INFO ANTES DE CUALQUIER TRANSICIÓN PRINCIPAL
        closeMenuInfoPanel();
        if(currentUiLayer === uiOverlayLayer && slideInteractiveElements.style.display === 'flex'){
            hideAllTextBlocksForCurrentSlide(); // Cierra los text-blocks de los slides
        }

        if (action.type === 'IMMEDIATE_INTRO_TO_MENU' || action.type === 'IMMEDIATE_MENU_TO_INTRO') {
            setControlsWaitingState(true); 
            if (action.type === 'IMMEDIATE_INTRO_TO_MENU') {
                actuallyShowMenuUi(); 
            } else { 
                actuallyShowIntroUi();
            }
            pendingAction = null; 
            return; 
        }
        // ... (resto de la función transitionToState sin cambios)
        if (isTransitioning && pendingAction) {
             if (pendingAction.type === action.type && 
                (pendingAction.animationSrc === action.animationSrc || 
                 pendingAction.entryTransition === action.entryTransition ||
                 pendingAction.exitTransition === action.exitTransition ||
                 pendingAction.slideTransitionVideo === action.slideTransitionVideo)) {
                return; 
            }
        }
        
        setControlsWaitingState(true); 
        pendingAction = action; 

        if (menuInfoTextBlock.classList.contains('visible')) { // Doble chequeo, por si acaso
            menuInfoTextBlock.classList.remove('visible');
            menuInfoButton.classList.remove('active');
        }
        
        let videoToWaitFor = currentVisibleVideo; 
        let videoToPlayAfterInitialEnd = null; 
        let loopForVideoAfterInitialEnd = false;
        let subsequentPendingAction = null; 
        let layerToActivateForNextVideo = null; 
        let layerToDeactivateAfterWait = null; 

        if (action.type === 'MENU_TO_SLIDE_WITH_TRANSITION') {
            videoToWaitFor = menuVideoElement; 
            videoToPlayAfterInitialEnd = transitionVideoElement;
            targetSlideAfterTransition = { slideId: action.slideId, slideAnimation: action.slideAnimation };
            await prepareVideoElement(transitionVideoElement, action.entryTransition);
            loopForVideoAfterInitialEnd = false; 
            subsequentPendingAction = { type: 'PLAY_SLIDE_AFTER_ENTRY_TRANSITION' };
            layerToActivateForNextVideo = transitionVideoLayer;
            layerToDeactivateAfterWait = menuVideoLayer;
        } else if (action.type === 'SLIDE_TO_MENU_WITH_TRANSITION') {
            videoToWaitFor = currentSlideVideoElement; 
            videoToPlayAfterInitialEnd = transitionVideoElement;
            await prepareVideoElement(transitionVideoElement, action.exitTransition);
            loopForVideoAfterInitialEnd = false;
            subsequentPendingAction = { type: 'SHOW_MENU_AFTER_EXIT_TRANSITION' };
            layerToActivateForNextVideo = transitionVideoLayer;
            layerToDeactivateAfterWait = slideVideoLayer;
        } else if (action.type === 'SLIDE_TO_SLIDE_WITH_TRANSITION') { 
            videoToWaitFor = currentSlideVideoElement;
            videoToPlayAfterInitialEnd = transitionVideoElement;
            targetSlideAfterTransition = { slideId: action.nextSlideId, slideAnimation: action.nextSlideAnimation };
            await prepareVideoElement(transitionVideoElement, action.slideTransitionVideo);
            loopForVideoAfterInitialEnd = false;
            subsequentPendingAction = { type: 'PLAY_SLIDE_AFTER_SLIDE_TRANSITION' };
            layerToActivateForNextVideo = transitionVideoLayer;
            layerToDeactivateAfterWait = slideVideoLayer; 
        }
        else if (action.type === 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP') { 
            videoToWaitFor = currentSlideVideoElement;
            await prepareVideoElement(nextSlideVideoElement, action.animationSrc);
            layerToActivateForNextVideo = slideVideoLayer; 
        } else { 
             if (action.type === 'SLIDE_TO_MENU_NO_TRANSITION') { videoToWaitFor = currentSlideVideoElement; layerToActivateForNextVideo = menuVideoLayer; layerToDeactivateAfterWait = slideVideoLayer;}
        }
        
        if (videoToWaitFor && (videoToWaitFor.currentSrc || (videoToWaitFor.querySelector('source') && videoToWaitFor.querySelector('source').src)) ) { 
            if (videoToWaitFor.loop) videoToWaitFor.loop = false; 
            videoToWaitFor.removeEventListener('ended', onVideoEnded); 
            videoToWaitFor.addEventListener('ended', 
                async function handleInitialEnd() { 
                    const previouslyActiveLayer = videoToWaitFor.closest('.video-layer');
                    if (videoToPlayAfterInitialEnd) {
                        if (subsequentPendingAction) {
                            pendingAction = subsequentPendingAction; 
                        }
                        if (layerToActivateForNextVideo !== menuVideoLayer) menuVideoLayer.classList.remove('active');
                        if (layerToActivateForNextVideo !== slideVideoLayer) slideVideoLayer.classList.remove('active');
                        if (layerToActivateForNextVideo !== transitionVideoLayer) transitionVideoLayer.classList.remove('active');
                        pauseVideo(menuVideoElement); 
                        pauseVideo(slideVideoBuffer1);
                        pauseVideo(slideVideoBuffer2);
                        if (videoToPlayAfterInitialEnd !== transitionVideoElement) pauseVideo(transitionVideoElement);

                        layerToActivateForNextVideo.classList.add('active');
                        videoToPlayAfterInitialEnd.classList.add('visible');
                        
                        videoToPlayAfterInitialEnd.removeEventListener('ended', onVideoEnded); 
                        videoToPlayAfterInitialEnd.addEventListener('ended', onVideoEnded, { once: true });
                        await playVideo(videoToPlayAfterInitialEnd, loopForVideoAfterInitialEnd); 

                        if (previouslyActiveLayer && previouslyActiveLayer !== layerToActivateForNextVideo) {
                             setTimeout(() => {
                                if(videoToWaitFor && videoToPlayAfterInitialEnd && videoToWaitFor.id !== videoToPlayAfterInitialEnd.id){ 
                                    previouslyActiveLayer.classList.remove('active');
                                    if (videoToWaitFor) videoToWaitFor.classList.remove('visible');
                                } else if (videoToWaitFor && !videoToPlayAfterInitialEnd) { 
                                     previouslyActiveLayer.classList.remove('active');
                                     if (videoToWaitFor) videoToWaitFor.classList.remove('visible');
                                }
                            }, 0); 
                        }
                    } else { 
                        onVideoEnded.call(this); 
                    }
                }, 
            { once: true });
            
            if (videoToWaitFor.paused || videoToWaitFor.ended || 
                (videoToWaitFor.duration > 0 && videoToWaitFor.currentTime >= videoToWaitFor.duration - 0.05)) { 
                videoToWaitFor.dispatchEvent(new Event('ended')); 
            }
        } else { 
             if (videoToPlayAfterInitialEnd) { 
                 if (subsequentPendingAction) {
                    pendingAction = subsequentPendingAction;
                 }
                menuVideoLayer.classList.remove('active');
                slideVideoLayer.classList.remove('active');
                layerToActivateForNextVideo.classList.add('active');
                videoToPlayAfterInitialEnd.classList.add('visible');
                
                videoToPlayAfterInitialEnd.removeEventListener('ended', onVideoEnded); 
                videoToPlayAfterInitialEnd.addEventListener('ended', onVideoEnded, { once: true });
                await playVideo(videoToPlayAfterInitialEnd, loopForVideoAfterInitialEnd);
            } else {
                onVideoEnded.call(videoToWaitFor || {}); 
            }
        }
    }
    
    function hideAllTextBlocksForCurrentSlide() {
        // ... (sin cambios)
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
        // ... (sin cambios)
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
        // ... (sin cambios)
        if (isTransitioning || menuInfoButton.classList.contains('waiting')) return;
        menuInfoTextBlock.classList.toggle('visible');
        menuInfoButton.classList.toggle('active', menuInfoTextBlock.classList.contains('visible'));
    });

    function ensureNoActiveSlideElements() {
        // ... (sin cambios)
        hideAllTextBlocksForCurrentSlide(); 
        document.querySelectorAll('.slide-specific-content.active').forEach(ssc => ssc.classList.remove('active'));
        if (slideInteractiveElements) slideInteractiveElements.style.display = 'none';
        if (slideBackToMenuButton) slideBackToMenuButton.style.display = 'none';
        currentSlideId = null; 
    }

    function actuallyShowIntroUi(comingFromTransitionVideo = false) {
        // ... (sin cambios)
        currentUiLayer.classList.remove('active');
        introLayer.classList.add('active');
        currentUiLayer = introLayer;

        if (!comingFromTransitionVideo) {
            transitionVideoLayer.classList.remove('active');
            pauseVideo(transitionVideoElement);
            transitionVideoElement.classList.remove('visible');
        }
        slideVideoLayer.classList.remove('active'); 
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        slideVideoBuffer1.classList.remove('visible');
        slideVideoBuffer2.classList.remove('visible');
        
        menuVideoLayer.classList.add('active');
        menuVideoElement.classList.add('blurred'); 
        staticFrameImage.classList.add('blurred');
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

    function actuallyShowMenuUi(comingFromTransitionVideo = false) {
        // ... (sin cambios)
        currentUiLayer.classList.remove('active');
        uiOverlayLayer.classList.add('active');    
        currentUiLayer = uiOverlayLayer;
        
        if (!comingFromTransitionVideo) {
            transitionVideoLayer.classList.remove('active');
            pauseVideo(transitionVideoElement);
            transitionVideoElement.classList.remove('visible');
        }
        slideVideoLayer.classList.remove('active');
        pauseVideo(slideVideoBuffer1); 
        pauseVideo(slideVideoBuffer2);
        slideVideoBuffer1.classList.remove('visible');
        slideVideoBuffer2.classList.remove('visible');
        
        menuVideoElement.classList.remove('blurred'); 
        staticFrameImage.classList.remove('blurred');
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
        // ... (sin cambios)
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
        if(isInitialSlideTransition && !slideVideoLayer.classList.contains('active')) { 
             if (transitionVideoLayer.classList.contains('active')) {
                // Si venimos de una transición Y la capa de slide no está activa, ocultar la de transición.
                // Esto es importante para cuando el video de transición termina y llamamos a prepareAndShowTargetSlide -> actuallyShowSlideUi
                transitionVideoLayer.classList.remove('active'); 
                pauseVideo(transitionVideoElement);
                transitionVideoElement.classList.remove('visible');
             }
        }
        pauseVideo(menuVideoElement);
        staticFrameImage.classList.remove('blurred'); 
        
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
        transitionToState({ type: 'IMMEDIATE_INTRO_TO_MENU' });
    });

    allMenuButtons.forEach(button => {
        // ... (Sin cambios)
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const slideId = button.dataset.slideId;
            const slideAnimation = button.dataset.animation; 
            const entryTransition = button.dataset.entryTransition; 

            if (slideId && slideAnimation && entryTransition) {
                closeMenuInfoPanel(); // Cierra el panel de info del menú si está abierto
                transitionToState({ 
                    type: 'MENU_TO_SLIDE_WITH_TRANSITION', 
                    slideId: slideId,
                    slideAnimation: slideAnimation, 
                    entryTransition: entryTransition 
                });
            } else if (slideId && slideAnimation) { 
                closeMenuInfoPanel();
                transitionToState({ type: 'MENU_TO_SLIDE_NO_TRANSITION', slideId: slideId, slideAnimation: slideAnimation });
            }
        });
    });

    slideBackToMenuButton.addEventListener('click', () => {
        // ... (Sin cambios)
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
        closeMenuInfoPanel(); // Cierra el panel de info del menú si está abierto
        transitionToState({ type: 'IMMEDIATE_MENU_TO_INTRO' });
    });

    allSlideNextButtons.forEach(button => {
        // ... (Sin cambios)
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const nextSlideId = button.dataset.nextSlideId;
            const nextAnimationPath = button.dataset.nextAnimation; 
            const slideTransitionVideo = button.dataset.transitionVideo; 

            if (nextSlideId && nextAnimationPath && slideTransitionVideo) {
                transitionToState({ 
                    type: 'SLIDE_TO_SLIDE_WITH_TRANSITION', 
                    nextSlideId: nextSlideId,
                    nextSlideAnimation: nextAnimationPath,
                    slideTransitionVideo: slideTransitionVideo
                });
            } else if (nextSlideId && nextAnimationPath) { 
                transitionToState({ type: 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP', animationSrc: nextAnimationPath, slideId: nextSlideId });
            }
        });
    });

    allSlidePrevButtons.forEach(button => {
        // ... (Sin cambios)
        button.addEventListener('click', () => {
            if (isTransitioning || button.classList.contains('waiting')) return;
            const prevSlideId = button.dataset.prevSlideId;
            const prevAnimationPath = button.dataset.prevAnimation; 
            const slideTransitionVideo = button.dataset.transitionVideo; 

            if (prevSlideId && prevAnimationPath && slideTransitionVideo) {
                transitionToState({ 
                    type: 'SLIDE_TO_SLIDE_WITH_TRANSITION',
                    nextSlideId: prevSlideId, 
                    nextSlideAnimation: prevAnimationPath,
                    slideTransitionVideo: slideTransitionVideo
                });
            } else if (prevSlideId && prevAnimationPath) { 
                transitionToState({ type: 'SLIDE_TO_SLIDE_NO_TRANSITION_BUFFER_SWAP', animationSrc: prevAnimationPath, slideId: prevSlideId });
            }
        });
    });

    // Listener para cerrar popups al hacer clic afuera
    document.addEventListener('click', (event) => {
        if (isTransitioning) return; // No hacer nada si hay una transición principal en curso

        // Cerrar panel de información del menú
        if (menuInfoTextBlock.classList.contains('visible') && 
            !menuInfoTextBlock.contains(event.target) && 
            event.target !== menuInfoButton) {
            closeMenuInfoPanel();
        }

        // Cerrar text-block de slide si está visible y el clic es fuera de él y de sus botones
        if (activeTextBlock && activeTextBlock.classList.contains('visible')) {
            const currentActiveSlideContent = document.querySelector(`.slide-specific-content[data-content-for-slide="${currentSlideId}"].active`);
            if (currentActiveSlideContent) {
                const isClickInsideActiveElements = 
                    activeTextBlock.contains(event.target) || // Clic dentro del texto
                    (activeCircleButton && activeCircleButton.contains(event.target)) || // Clic en el botón círculo activo
                    event.target.closest('.circle-buttons-container'); // Clic en el contenedor de botones círculo (para evitar cerrar si se hace scroll)

                if (!isClickInsideActiveElements) {
                    hideAllTextBlocksForCurrentSlide();
                }
            }
        }
    });


    async function initializeApp() {
        // ... (Sin cambios)
        uiOverlayLayer.classList.remove('active');
        introLayer.classList.remove('active'); 
        ensureNoActiveSlideElements(); 
        menuBackToIntroButton.style.display = 'none';
        transitionVideoLayer.classList.remove('active'); 
        staticFrameImage.classList.remove('blurred');
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