/**
 * js/player.js
 *
 * YouTube IFrame API wrapper.
 *
 * Key responsibility: suppress state-change events during programmatic control
 * so we never echo a sync command back to the server (sync loop prevention).
 *
 * The YouTube IFrame API script is loaded on demand inside init().
 */

'use strict';

class YouTubePlayer {
  /**
   * @param {object}   o
   * @param {string}   o.containerId - ID of the div the player renders into
   * @param {Function} [o.onReady]   - Fires when player is ready
   * @param {Function} [o.onPlay]    - Fires on user-initiated play (currentTime)
   * @param {Function} [o.onPause]   - Fires on user-initiated pause (currentTime)
   */
  constructor({ containerId, onReady, onPlay, onPause }) {
    this.containerId     = containerId;
    this._onReady        = onReady  || (() => {});
    this._onPlay         = onPlay   || (() => {});
    this._onPause        = onPause  || (() => {});
    this.player          = null;
    this._currentVideoId = null;
    this._suppressing    = false;
    this._suppressTimer  = null;
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  /**
   * Loads the YouTube IFrame API (if needed) and creates the player.
   * Safe to call multiple times.
   */
  init() {
    if (this.player) return;

    if (window.YT?.Player) {
      this._createPlayer();
    } else {
      // Chain onto any existing callback (don't clobber)
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        this._createPlayer();
      };
      // Inject script tag if not already present
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src   = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
    }
  }

  _createPlayer() {
    this.player = new YT.Player(this.containerId, {
      height: '100%',
      width:  '100%',
      videoId: '',
      playerVars: {
        controls:       0,  // hide native controls (we provide our own)
        disablekb:      1,  // disable keyboard shortcuts in iframe
        modestbranding: 1,
        rel:            0,  // no related videos
        playsinline:    1,  // iOS inline playback
        iv_load_policy: 3,  // hide annotations
        cc_load_policy: 0,
        fs:             1,
      },
      events: {
        onReady:       ()  => this._onReady(),
        onStateChange: (e) => this._handleStateChange(e),
        onError:       (e) => console.error('[Player] YouTube error code:', e.data),
      },
    });
  }

  // ─── Suppression ─────────────────────────────────────────────────────────

  /**
   * Silences onPlay/onPause callbacks for `ms` ms.
   * Called before every programmatic play/pause/seek.
   */
  _suppress(ms = 500) {
    this._suppressing = true;
    clearTimeout(this._suppressTimer);
    this._suppressTimer = setTimeout(() => { this._suppressing = false; }, ms);
  }

  _handleStateChange({ data }) {
    if (this._suppressing) return;
    if (data === YT.PlayerState.PLAYING) this._onPlay(this.getCurrentTime());
    if (data === YT.PlayerState.PAUSED)  this._onPause(this.getCurrentTime());
  }

  // ─── Public Controls ──────────────────────────────────────────────────────

  play()           { this._suppress(400); this.player?.playVideo(); }
  pause()          { this._suppress(400); this.player?.pauseVideo(); }
  seekTo(seconds)  { this._suppress(600); this.player?.seekTo(Math.max(0, seconds), true); }

  /** Load a video by ID. Starts paused; let sync events decide whether to play. */
  loadVideo(videoId) {
    this._currentVideoId = videoId;
    this._suppress(1500);
    if (this.player) {
      this.player.loadVideoById(videoId);
      this.player.pauseVideo();
    }
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getCurrentTime() { return this.player?.getCurrentTime() ?? 0; }
  getDuration()    { return this.player?.getDuration()    ?? 0; }
  isPlaying()      { return this.player?.getPlayerState() === 1; /* PLAYING */ }
  hasVideo()       { return !!this._currentVideoId; }
  isReady()        { return !!this.player; }
}
