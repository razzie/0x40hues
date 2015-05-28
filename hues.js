(function() {
  "use strict";
  var self = {
    "defaults": {
      "respack": encodeURIComponent("0x40 Hues 5.0 Defaults"),
      /* In the default respack, this is "weapon" */
      "song": 18,
      "hues": "builtin",
    },

    /* Values are 0: normal, 1: auto, 2: full auto
     * normal never changes image.
     * auto changes image only on song start or loop
     * full auto changes image according to song rhythm
     */
    "autoMode": 2,

    /* All the respacks that are currently loaded
     * Respacks can contain hues, images, and songs. */
    "respacks": {},

    /* The currently loaded list of hues */
    "hues": [],
    /* The currently loaded list of images */
    "images": [],
    /* The currently loaded list of songs */
    "songs": [],

    /* Index of the current hue */
    "hueIndex": null,
    /* The current hue */
    "hue": null,

    /* Index of the currently playing song */
    "songIndex": null,
    /* The currently playing song */
    "song": null,

    /* Index of the currently visible image */
    "imageIndex": null,
    /* The currently visible image */
    "image": null,

    /* Handle for the beat analysis animation frame callback. */
    "beatAnalysisHandle": null,

    /* Length of a beat in this song */
    "beatDuration": null,
    /* Information about the current beat */
    "beat": { "buildup": null, "loop": null },

    /* Event listener hookups for UI functionality. */
    "eventListeners": {
      /* Loading progress */

      /* callback progressstart()
       * Notify that a loading process has started, and a progress indicator
       * should be displayed.
       *
       * No parameters
       */
      "progressstart": [],

      /* callback progress(completedWork, newWork)
       * Update the progress indicator.
       *
       * completedWork: Integer number of jobs completed.
       * newWork: Integer number of new (incomplete) jobs added
       */
      "progress": [],

      /* callback progressend()
       * Notify that a loading process has completed.
       * To get the actual status of the process, you have to resolve the
       * promise from the call that initiated the loading process.
       *
       * No parameters
       */
      "progressend": [],

      /* User settings updates */

      /* callback automodechange()
       * The "auto mode" (automatic image advance) setting has changed.
       */
      "automodechange": [],

      /* Effects */

      /* callback huechange(hueInfo)
       * Called from beat analysis (in request animation frame context) prior
       * to the beat callback if the new effect includes a hue change.
       * Also called during initialization and when loading a respack.
       *
       * hueInfo: Same as the return value of getCurrentHue()
       */
      "huechange": [],

      /* callback imagechange(imageInfo)
       * Indicates that currently displayed image has changed.
       * This callback can be called in multiple contexts, depending on the
       * current "autoMode" setting.
       * If "full auto", this is called from beat analysis (in request
       * animation frame context) prior to the beat callback if the new effect
       * includes an image change.
       * If "auto", this is called during the setup while switching songs.
       * This is also called any time a user-initiated image change is done,
       * via the changeImage(), prevImage(), or nextImage() functions.
       * Also can be called during initialization or when loading a respack.
       *
       * imageInfo: Same as the return value of getCurrentImage()
       */
      "imagechange": [],

      /* callback songchange(songInfo)
       * Indicated that the currently playing song has changed.
       * This is called any time a user-initiated song change is done, via the
       * changeSong(), prevSong(), or nextSong() functions.
       * Also can be called during initialization or when loading a respack.
       *
       * songInfo: Same as the return value of getCurrentSong()
       */
      "songchange": [],
      "beat": [],
    }
  };

  /* Hues.setAutoMode(autoMode) 
   * Select when to automatically change images.
   *
   * autoMode: One of the following values:
   *     * "normal": Never automatically change images.
   *     * "auto": Change image when the song loops or changes.
   *     * "full auto": Image changes are managed by the song rhythm string.
   *
   * No return value.
   */
  var setAutoMode = function(autoMode) {
    switch (autoMode) {
    case "normal":
      self["autoMode"] = 0; break;
    case "auto":
      self["autoMode"] = 1; break;
    case "full auto":
      self["autoMode"] = 2; break;
    default:
      throw Error("Unknown auto mode: " + autoMode);
    }
  }

  /* Hues.getAutoMode()
   * Get the current image changing mode.
   *
   * Returns the string name of the mode (see setAutoMode() for the list)
   */
  var getAutoMode = function() {
    switch (self["autoMode"]) {
    case 0: return "normal";
    case 1: return "auto";
    case 2: return "full auto";
    }
  };

  /* Hues.addHues(respackName, [huesList])
   * Add hues from a loaded respack to the active hues list.
   * 
   * respackName: Name of respack to load hues from.
   * huesList: (optional) List of indexes of particular hues to load from
   *     the respack
   *
   * Throws Error when the requested respack isn't loaded, doesn't
   * contain hues, or you ask for hues that aren't in the respack.
   *
   * No return value.
   */
  var addHues = function(respackName) {
    var huesList = arguments[1];

    var respack = self["respacks"][respackName];
    if (typeof(respack) === "undefined") {
      throw Error("Unknown respack: " + respackName);
    };

    var hues = respack["hues"];
    if (typeof(hues) === "undefined") {
      throw Error("Respack does not contain hues: " + respackName);
    };

    var addHue = function(hue) {
      /* Avoid duplicate hues; skip a hue if it's already in the list */
      var hues = self["hues"];
      var i = hues.indexOf(hue);
      if (i < 0) {
        hues.push(hue);
      }
    };

    if (typeof(huesList) !== "undefined") {
      huesList.forEach(function(hueIndex) {
        addHue(hues[hueIndex]);
      });
    } else {
      hues.forEach(addHue);
    }
  };

  /* Hues.addSongs(respackName, [songsList])
   * Add songs from a loaded respack to the active songs list.
   * 
   * respackName: Name of respack to load songs from.
   * songsList: (optional) List of indexes of particular songs to load from
   *     the respack
   *
   * Throws Error when the requested respack isn't loaded, doesn't
   * contain songs, or you ask for songs that aren't in the respack.
   *
   * No return value.
   */
  var addSongs = function(respackName) {
    var songsList = arguments[1];

    var respack = self["respacks"][respackName];
    if (typeof(respack) === "undefined") {
      throw Error("Unknown respack: " + respackName);
    };

    var songs = respack["songs"];
    if (typeof(songs) === "undefined") {
      throw Error("Respack does not contain songs: " + respackName);
    };

    var addSong = function(song) {
      /* Avoid duplicate songs; skip a song if it's already in the list */
      var songs = self["songs"];
      var i = songs.indexOf(song);
      if (i < 0) {
        songs.push(song);
      }
    };

    if (typeof(songsList) !== "undefined") {
      songsList.forEach(function(songIndex) {
        addSong(songs[songIndex]);
      });
    } else {
      songs.forEach(addSong);
    }
  };

  /* Hues.playSong()
   * Start playing the currently selected song.
   *
   * Returns a promise that will resolve once the song is playing, and will
   * reject if playback fails.
   */
  var playSong = function() {
    return changeSong(self["songIndex"]);
  }

  /* Hues.prevSong()
   * Switch to the previous song (wraps) and start playing it.
   *
   * Returns a promise that will resolve once the song is playing, and will
   * reject if playback fails.
   */
  var prevSong = function() {
    var i = self["songIndex"];
    i -= 1;
    if (i < 0) {
      i = self["songs"].length - 1;
    }
    return changeSong(i);
  }

  /* Hues.nextSong()
   * Switch to the next song (wraps) and start playing it.
   *
   * Returns a promise that will resolve once the song is playing, and will
   * reject if playback fails.
   */
  var nextSong = function() {
    var i = self["songIndex"];
    i += 1;
    if (i >= self["songs"].length) {
      i = 0;
    }
    return changeSong(i);
  }

  /* Hues.addImages(respackName, [imagesList])
   * Add images from a loaded respack to the active images list.
   * 
   * respackName: Name of respack to load songs from.
   * imagesList: (optional) List of indexes of particular images to load from
   *     the respack
   *
   * Throws Error when the requested respack isn't loaded, doesn't
   * contain images, or you ask for images that aren't in the respack.
   *
   * No return value.
   */
  var addImages = function(respackName) {
    var imagesList = arguments[1];

    var respack = self["respacks"][respackName];
    if (typeof(respack) === "undefined") {
      throw Error("Unknown respack: " + respackName);
    };

    var images = respack["images"];
    if (typeof(images) === "undefined") {
      throw Error("Respack does not contain images: " + respackName);
    };

    var addImage = function(image) {
      /* Avoid duplicate images; skip an image if it's already in the list */
      var images = self["images"];
      var i = images.indexOf(image);
      if (i < 0) {
        images.push(image);
      }
    };

    if (typeof(imagesList) !== "undefined") {
      imagesList.forEach(function(imageIndex) {
        addImage(images[imageIndex]);
      });
    } else {
      images.forEach(addImage);
    }
  };

  /* Hues.changeImage(imageIndex)
   * Change the image to one at a particular index
   *
   * No return value.
   */
  var changeImage = function(imageIndex) {
    var images = self["images"];
    var image = images[imageIndex];
    if (typeof(image) === "undefined") {
      throw Error("Image index " + imageIndex + " out of range");
    }

    self["imageIndex"] = imageIndex;
    self["image"] = image;

    callEventListeners("imagechange", image);
  }

  /* Hues.randomImage()
   * Select a new image, randomly.
   *
   * No return value.
   */
  var randomImage = function() {
    var images = self["images"];
    var i;
    if (self["imageIndex"] === null) {
      i = Math.floor(Math.random() * images.length);
    } else {
      i = Math.floor(Math.random() * (images.length - 1));
      if (i >= self["imageIndex"]) {
        i += 1;
      }
    }
    changeImage(i);
  }

  /* Hues.getCurrentImage()
   * Get the currently visible image.
   *
   * Returns the image info object, or null if no image visible.
   */
  var getCurrentImage = function() {
    return self["image"];
  }

  /* Hues.addEventListener(event, callback)
   * Add a listener for an event generated by the Hues core.
   *
   * Note that this function allows you to add the same callback multiple
   * times.
   *
   * event: Name of the event
   * callback: Function to call when event fires
   *
   * Throws an error if you attempt to add a listener to an undefined event.
   *
   * No return value.
   */
  var addEventListener = function(ev, callback) {
    ev = ev.toLowerCase();
    if (typeof(self["eventListeners"][ev]) !== "undefined") {
      self["eventListeners"][ev].push(callback);
    } else {
      throw Error("Unknown event: " + ev);
    }
  };

  /* Hues.removeEventListener(event, callback)
   * Disable an event listener, removing the callback function.
   *
   * Note that if the callback was in the list multiple times, all instances
   * will be removed.
   *
   * event: Name of the event
   * callback: Function to call when event fires
   *
   * Throws an error if you attempt to remove a listener from an undefined
   * event.
   */
  var removeEventListener = function(ev, callback) {
    ev = ev.toLowerCase();
    if (typeof(self["eventListeners"][ev]) !== "undefined") {
      self["eventListeners"][ev] =
          self["eventListeners"][ev].filter(function(a) {
        return (a !== callback);
      });
    } else {
      throw Error("Unknown event: " + ev);
    }
  };

  /* Load configuration, which is set in a global (window) object */
  (function() {
    var respackURI = window.huesConfig["respack"];
    if (typeof(respackURI) !== 'undefined') {
      self["defaults"]["respackURI"] = respackURI;
    }

    var song = window.huesConfig["defaultSong"];
    if (typeof(song) !== 'undefined') {
      self["defaults"]["song"] = song;
    }

    var autoMode = window.huesConfig["autoMode"];
    if (typeof(autoMode) !== 'undefined') {
      setAutoMode(autoMode);
    }
  })();

  /* The public object */
  var Hues = {
    "setAutoMode": setAutoMode,
    "getAutoMode": getAutoMode,
    "addHues": addHues,
    "addSongs": addSongs,
    "playSong": playSong,
    "prevSong": prevSong,
    "nextSong": nextSong,
    "addImages": addImages,
    "changeImage": changeImage,
    "randomImage": randomImage,
    "getCurrentImage": getCurrentImage,
    "addEventListener": addEventListener,
    "removeEventListener": removeEventListener
  };




  var audioCtx = new AudioContext;
  var currentBuildupSource = null;
  var currentBuildupBuffer = null;
  var currentBuildupStartTime = null;
  var currentLoopSource = null;
  var currentLoopBuffer = null;
  var currentLoopStartTime = null;

  var gainNode = audioCtx.createGain();

  Hues["respack"] = {};

  /* Call event listeners */
  var callEventListeners = function(ev) {
    var args = Array.prototype.slice.call(arguments, 1);
    self["eventListeners"][ev].forEach(function(callback) {
      callback.apply(null, args);
    });
  };

  var loadRespackInfo = function(respack) {
    return new Promise(function(resolve, reject) {
      fetch(respack["uri"] + "/info.xml")
      .catch(reject)
      .then(function(response) {

        if (!response.ok) {
          reject(Error("Could not fetch respack info.xml: " +
                response.status + " " + response.statusText));
          return;
        }

        response.text()
        .catch(reject)
        .then(function(bodyText) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(bodyText, "application/xml");
          var iterator = doc.evaluate("/info/*", doc, null,
              XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
          var node = iterator.iterateNext();
          while (node) {
            respack[node.localName] = node.textContent;
            node = iterator.iterateNext();
          }
          resolve(respack);
        });
      });
    });
  };

  var loadRespackHues = function(respack) {
    return new Promise(function(resolve, reject) {
      fetch(respack["uri"] + "/hues.xml")
      .catch(reject)
      .then(function(response) {
        
        if (response.status == 404) {
          resolve(respack);
          return;
        }
        
        if (!response.ok) {
          reject(Error("Could not fetch respack hues.xml: " +
                response.status + " " + response.statusText));
          return;
        }

        response.text()
        .catch(reject)
        .then(function(bodyText) {
          respack["hues"] = [];

          var parser = new DOMParser();
          var doc = parser.parseFromString(bodyText, "application/xml");
          var iterator = doc.evaluate("/hues/hue", doc, null,
              XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          var node = iterator.iterateNext();
          while (node) {
            var hue = {};
            hue["name"] = node.getAttribute("name");
            var hex = node.textContent;
            if (!hex[0] == "#") {
              hex = "#" + hex;
            }
            hue["hex"] = hex;

            /* The effects need the hue value as r,g,b floating-point */
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) {
              throw Error("Could not parse color value for " + name + ": " +
                  hex);
            }
            hue["rgb"] = [
              parseInt(result[1], 16) / 255,
              parseInt(result[2], 16) / 255,
              parseInt(result[3], 16) / 255
            ];


            respack["hues"].push(hue);

            node = iterator.iterateNext();
          };

          resolve(respack);
        });
      });
    });
  }

  var loadRespackSongTrackFetch = function(uri) {
    return new Promise(function(resolve, reject) {
      fetch(uri)
      .then(function(response) {
        if (!response.ok) {
          reject(Error("Failed to fetch " + uri + ": " +
                response.status + " " + response.statusText));
          return;
        }
        resolve(response.arrayBuffer())
      })
      .catch(reject)
    });
  }

  var loadRespackSongTrackDecode = function(buffer) {
    return new Promise(function(resolve, reject) {
      audioCtx.decodeAudioData(buffer, function(audioBuffer) {
        resolve(audioBuffer);
      }, function(error) {
        reject(Error("Could not decode audio: " + error));
      });
    });
  }

  var loadRespackSongTrack = function(uri) {
    return new Promise(function(resolve, reject) {
      loadRespackSongTrackFetch(uri + ".opus")
      .then(loadRespackSongTrackDecode)
      .then(resolve)
      .catch(function(error) {
        console.log("opus failed to load", error);
        loadRespackSongTrackFetch(uri + ".ogg")
        .then(loadRespackSongTrackDecode)
        .then(resolve)
        .catch(function() {
          console.log("ogg failed to load: ", error);
          loadRespackSongTrackFetch(uri + ".mp3")
          .then(loadRespackSongTrackDecode)
          .then(resolve)
          .catch(function() {
            console.log("mp3 failed to load: ", error);
            reject(Error("Could not find any supported audio track formats"));
          });
        });
      });
    });
  }

  var loadRespackSongLoop = function(respack, song) {
    return new Promise(function(resolve, reject) {
      var uri = respack["uri"] + "/Songs/" + encodeURIComponent(song["loop"]);
      loadRespackSongTrack(uri)
      .catch(reject)
      .then(function(audioBuffer) {
        song["loopBuffer"] = audioBuffer;
        resolve(song);
      });
    });
  };

  var loadRespackSongBuildup = function(respack, song) {
    return new Promise(function(resolve, reject) {
      if (!song["buildup"]) {
        resolve(song);
        return;
      }

      var uri = respack["uri"] + "/Songs/" +
            encodeURIComponent(song["buildup"]);
      loadRespackSongTrack(uri)
      .catch(reject)
      .then(function(audioBuffer) {
        song["buildupBuffer"] = audioBuffer;
        resolve(song);
      });
    });
  }

  var loadRespackSongMedia = function(respack, song) {
    var loop = loadRespackSongLoop(respack, song);
    var buildup = loadRespackSongBuildup(respack, song);
    return Promise.all([loop, buildup]).then(function() {
      return Promise.resolve(song)
    });
  }

  var loadRespackSongs = function(respack) {
    return new Promise(function(resolve, reject) {
      fetch(respack["uri"] + "/songs.xml")
      .catch(reject)
      .then(function(response) {
        
        if (response.status == 404) {
          resolve(respack);
          return;
        }
        
        if (!response.ok) {
          reject(Error("Could not fetch respack songs.xml: " +
                response.status + " " + response.statusText));
          return;
        }

        response.text()
        .catch(reject)
        .then(function(bodyText) {
          respack["songs"] = [];
          var songPromises = [];

          var parser = new DOMParser();
          var doc = parser.parseFromString(bodyText, "application/xml");
          var iterator = doc.evaluate("/songs/song", doc, null,
              XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          var node = iterator.iterateNext();
          while (node) {
            var song = {};
            song["loop"] = node.getAttribute("name");

            var songIterator = doc.evaluate("*", node, null,
                XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            var songNode = songIterator.iterateNext();
            while (songNode) {
              song[songNode.localName] = songNode.textContent;
              songNode = songIterator.iterateNext();
            }

            respack["songs"].push(song);
            callEventListeners("progress", 0, 1);
            songPromises.push(loadRespackSongMedia(respack, song)
              .then(function() {
                callEventListeners("progress", 1, 0);
              })
            );

            node = iterator.iterateNext();
          };

          Promise.all(songPromises).then(function() {
            resolve(respack);
          }).catch(reject);
        });
      });
    });
  }

  var loadRespackImageAnimationFrame = function(respack, image, i) {
    return new Promise(function(resolve, reject) {
      var name = encodeURIComponent(image["name"]);
      var number = i.toString();
      if (number.length < 2) {
        number = "0" + number;
      }
      fetch(respack["uri"] + "/Animations/" + name + "/" + name + "_" +
          number + ".png")
      .catch(reject)
      .then(function(response) {

        if (response.status == 404) {
          // The previous image was the last in the series
          console.log("If you got a 404 error there it was expected and " +
                "unavoidable... You can just ignore it.");
          resolve(image);
          return;
        }

        if (!response.ok) {
          reject(Error("Failed to fetch frame " + i + " of image " +
                image["name"] + " in " + respack["name"] + ": " +
                response.status + " " + response.statusText));
          return;
        }
        
        response.blob()
        .catch(reject)
        .then(function(blob) {
          var img = document.createElement("img");
          img.src = URL.createObjectURL(blob);
          image["animation"].push(img);
          resolve(loadRespackImageAnimationFrame(respack, image, i + 1));
        });

      });
    });
  }

  var loadRespackImageAnimation = function(respack, image) {
    return new Promise(function(resolve, reject) {
      // Animations are a bit tricky, since the xml file doesn't say how many
      // frames there are. We have to fetch them until we hit a missing file...
      image["animation"] = [];
      var i = 1;

      loadRespackImageAnimationFrame(respack, image, i)
      .catch(reject)
      .then(function() {
        if (image["animation"].length == 0) {
          reject(Error("Animation for image " + image["name"] + " in " +
                respack["name"] + " had no frames load"));
        } else {
          resolve(image);
        }
      });
    });
  }

  var loadRespackImageSingle = function(respack, image) {
    return new Promise(function(resolve, reject) {
      var img = document.createElement("img");
      img.addEventListener("error", function(error) {
        reject(error);
      });
      img.addEventListener("load", function() {
        image["img"] = img;
        resolve(image);
      });
      img.src = respack["uri"] + "/Images/" +
          encodeURIComponent(image["name"]) + ".png";
    });
  }

  var loadRespackImageMedia = function(respack, image) {
    if (image["frameDuration"]) {
      return loadRespackImageAnimation(respack, image);
    } else {
      return loadRespackImageSingle(respack, image);
    }
  }

  var loadRespackImages = function(respack) {
    return new Promise(function(resolve, reject) {
      fetch(respack["uri"] + "/images.xml")
      .catch(reject)
      .then(function(response) {
        
        if (response.status == 404) {
          resolve(respack);
          return;
        }
        
        if (!response.ok) {
          reject(Error("Could not fetch respack images.xml: " +
                response.status + " " + response.statusText));
          return;
        }

        response.text()
        .catch(reject)
        .then(function(bodyText) {
          respack["images"] = [];
          var imagePromises = [];

          var parser = new DOMParser();
          var doc = parser.parseFromString(bodyText, "application/xml");
          var iterator = doc.evaluate("/images/image", doc, null,
              XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          var node = iterator.iterateNext();
          while (node) {
            var image = {};
            image["name"] = node.getAttribute("name");

            var imageIterator = doc.evaluate("*", node, null,
                XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            var imageNode = imageIterator.iterateNext();
            while (imageNode) {
              image[imageNode.localName] = imageNode.textContent;
              imageNode = imageIterator.iterateNext();
            }

            respack["images"].push(image);
            callEventListeners("progress", 0, 1);
            imagePromises.push(loadRespackImageMedia(respack, image)
              .then(function() {
                callEventListeners("progress", 1, 0);
              })
            );

            node = iterator.iterateNext();
          };

          Promise.all(imagePromises).then(function() {
            resolve(respack);
          }).catch(reject);

        });
      });
    });
  }

  var loadRespack = function(uri) {
    return new Promise(function(resolve, reject) {
      // Strip a trailing /, since we're going to be generating uris with this
      // as the base.
      if (uri.slice(-1) == "/") {
        uri = uri.slice(0, -1);
      }
      var respack = {
        "uri": uri
      };

      console.log("Loading respack at " + uri);
      callEventListeners("progress", 0, 4);

      var respackInfo = loadRespackInfo(respack);
      
      respackInfo.then(function(respack) {
        console.log("Loaded respack info for " + respack["name"]);
        callEventListeners("progress", 1, 0);
      });

      var respackHues = respackInfo.then(loadRespackHues);
      respackHues.then(function(respack) {
        if (respack["hues"]) {
          console.log("Loaded " + respack["hues"].length +
              " hues from " + respack["name"]);
        } else {
          console.log("Respack contains no hues: " + respack["name"]);
        }
        callEventListeners("progress", 1, 0);
      });

      var respackSongs = respackInfo.then(loadRespackSongs);
      respackSongs.then(function(respack) {
        if (respack["songs"]) {
          console.log("Loaded " + respack["songs"].length +
              " songs from " + respack["name"]);
        } else {
          console.log("Respack contains no songs: " + respack["name"]);
        }
        callEventListeners("progress", 1, 0);
      });

      var respackImages = respackInfo.then(loadRespackImages);
      respackImages.then(function(respack) {
        if (respack["images"]) {
          console.log("Loaded " + respack["images"].length +
              " images from " + respack["name"]);
        } else {
          console.log("Respack has no images: " + respack["name"]);
        }
        callEventListeners("progress", 1, 0);
      });
      Promise.all([respackHues, respackSongs, respackImages])
      .catch(reject)
      .then(function() {
        console.log("All content from respack " + respack["name"] +
            " has loaded");
        self["respacks"][respack["name"]] = respack;
        resolve(respack);
      });

    });
  }
  Hues["loadRespack"] = loadRespack;

  var loadDefaultRespack = function() {
    callEventListeners("progressstart");
    var builtin = loadRespack("respacks/builtin");

    var respackURI = self["defaults"]["respack"];
    if (respackURI.indexOf(":") < 0) {
      respackURI = "respacks/" + respackURI;
    }

    var respack = loadRespack(respackURI);

    return Promise.all([builtin, respack])
    .then(function(respacks) {
      var builtin = respacks[0];
      var respack = respacks[1];

      if (respack["hues"]) {
        addHues(respack["name"]);
      } else {
        addHues("builtin");
      }
      console.log("Loaded hues:");
      console.log(self["hues"]);
      randomHue();

      /* Preset the currently selected song, but without starting playback */
      if (respack["songs"]) {
        addSongs(respack["name"]);
        self["songIndex"] = self["defaults"]["song"];
        self["song"] = self["songs"][self["defaults"]["song"]];
      }
      console.log("Loaded songs:");
      console.log(self["songs"]);

      if (respack["images"]) {
        addImages(respack["name"]);
        if (self["defaults"]["image"] >= 0) {
          self["imageIndex"] = self["defaults"]["image"];
        } else {
          randomImage();
        }
      }
      console.log("Loaded images:");
      console.log(self["images"]);
      callEventListeners("progressend");
    });
  }
  Hues["loadDefaultRespack"] = loadDefaultRespack;

  var dumpRespackAnimation = function(img, image) {
    var i = 0;
    img.src = URL.createObjectURL(image["animation"][i]);

    setInterval(function() {
      i = i + 1;
      if (i >= image["animation"].length) {
        i = 0;
      }
      img.src = URL.createObjectURL(image["animation"][i]);
    }, image["frameDuration"]);
  }

  var stopSong = function() {
    console.log("Stopping playback");

    if (currentLoopSource) {
      currentLoopSource.stop();
      currentLoopSource.disconnect();
      currentLoopSource = null;
    }
    if (currentLoopBuffer) {
      currentLoopBuffer = null;
    }
    if (currentBuildupSource) {
      currentBuildupSource.stop();
      currentBuildupSource.disconnect();
      currentBuildupSource = null;
    }
    if (currentBuildupBuffer) {
      currentBuildupBuffer = null;
    }
  }
  Hues["stopSong"] = stopSong;

  var changeSong = function(songIndex) {
    stopSong();

    console.log("New song index is " + songIndex);
    var song = self["songs"][songIndex];
    self["songIndex"] = songIndex;
    self["song"] = song;

    console.log("Switching to " + song["title"]);

    var buildupBuffer = song["buildupBuffer"];
    var buildupDuration = 0;
    var buildupSource = null;
    if (buildupBuffer && buildupBuffer.length > 0) {
      buildupDuration = buildupBuffer.duration;
      buildupSource = audioCtx.createBufferSource();
      buildupSource.buffer = buildupBuffer;
      buildupSource.connect(audioCtx.destination);
    }

    var loopBuffer = song["loopBuffer"];
    var loopDuration = loopBuffer.duration;
    var loopSource = audioCtx.createBufferSource();
    loopSource.buffer = loopBuffer;
    loopSource.loop = true;
    loopSource.connect(audioCtx.destination);

    var beatDuration = loopDuration / song["rhythm"].length;
    console.log("Beat duration is " + beatDuration);
    console.log("Buildup duration is " + buildupDuration + " (" +
      Math.round(buildupDuration / beatDuration) + " beats)")
    console.log("Loop duration is " + loopDuration + " (" +
      song["rhythm"].length + " beats)")
    self["beatDuration"] = beatDuration;

    if (buildupBuffer) {
      /* Songs that have buildups might be missing buildupRhythm, or
       * have it too short. Fix that by padding it. */
      if (typeof(song["buildupRhythm"]) !== "undefined") {
        var buildupDelta = Math.round(buildupDuration / beatDuration) - 
          song["buildupRhythm"].length;
        if (buildupDelta > 0) {
          song["buildupRhythm"] += ".".repeat(buildupDelta);
        }
      } else {
        song["buildupRhythm"] = ".".repeat(
            Math.round(buildupDuration / beatDuration));
      }
    }

    var buildupStart = audioCtx.currentTime;
    var loopStart = buildupStart + buildupDuration;

    if (buildupSource) {
      currentBuildupSource = buildupSource;
      currentBuildupBuffer = buildupBuffer;
      buildupSource.start(buildupStart);
    }
    currentLoopSource = loopSource;
    currentLoopBuffer = loopBuffer;
    loopSource.start(loopStart);

    currentBuildupStartTime = buildupStart;
    currentLoopStartTime = loopStart;

    startBeatAnalysis();

    callEventListeners("songchange", song);

    return Promise.resolve(song);
  };
  Hues["changeSong"] = changeSong;


  var getCurrentSong = function() {
    return self["song"];
  }
  Hues["getCurrentSong"] = getCurrentSong;

  var getCurrentHue = function() {
    var index = self["hueIndex"];
    var hue = self["hue"];
    return {"index": index, "hue": hue};
  };
  Hues["getCurrentHue"] = getCurrentHue;

  var randomHue = function() {
    var hues = self["hues"];
    var index = self["hueIndex"];
    var newIndex;
    if (index === null) {
      newIndex = Math.floor(Math.random() * hues.length);
    } else {
      newIndex = Math.floor(Math.random() * (hues.length - 1));
      if (newIndex >= index) {
        index += 1;
      }
    }
    var hue = hues[newIndex];
    self["hueIndex"] = newIndex;
    self["hue"] = hue;
    callEventListeners("huechange", {"index": newIndex, "hue": hue});
  }


  var doBeatEffect = function(beatChar) {
    switch (beatChar) {
    case 'x':
      /* Vertical blur (snare) 
       * Changes color.
       * Changes image on full auto. */
      randomHue();
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    case 'o':
      /* Horizontal blur (bass)
       * Changes color.
       * Changes image on full auto. */
      randomHue();
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    case '-':
      /* No blur
       * Changes color.
       * Changes image on full auto. */
      randomHue();
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    case '+':
      /* Blackout
       * Blackout lasts until next effect. */
      break;
    case '|':
      /* Short blackout
       * Changes image on full auto‽ */
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    case ':':
      /* Color only */
      randomHue();
      break;
    case '*':
      /* Image only */
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    case 'X':
      /* Vertical blur only
       * Changes color.
       * Unlike 'x', does *not* change image on full auto. */
      randomHue();
      break;
    case 'O':
      /* Horizontal blur only
       * Changes color.
       * Unlike 'o', does *not* change image on full auto. */
      randomHue();
      break;
    case '~':
      /* Fade color
       * Color fade duration is until next effect. */
      break;
    case '=':
      /* Fade and change image
       * Image change is immediate.
       * Color fade duration is until next effect. */
      if (self["autoMode"] == 2) {
        randomImage();
      }
      break;
    }
  };

  var beatAnalyze = function() {
    if (!currentLoopBuffer) {
      stopBeatAnalysis();
      return;
    }

    var time = audioCtx.currentTime;
    var prevBeat = self["beat"];
    var beat = null;
    var beatChar = null;
    var song = self["song"];
    var beatDuration = self["beatDuration"];

    if (typeof(song["buildupRhythm"]) !== "undefined" &&
        time < currentLoopStartTime) {
      /* In the buildup */
      beat = {
        "buildup": Math.floor((time - currentBuildupStartTime) /
              beatDuration),
        "loop": null
      };
      beatChar = song["buildupRhythm"].charAt(beat["buildup"]);
    } else if (time >= currentLoopStartTime) {
      beat = {
        "buildup": null,
        "loop": Math.floor(
              (time - currentLoopStartTime) % currentLoopBuffer.duration /
                beatDuration)
      };
      beatChar = song["rhythm"].charAt(beat["loop"]);
    } else {
      beat = { "buildup": null, "loop": null };
    }

    if ((beat["buildup"] != prevBeat["buildup"]) ||
          (beat["loop"] != prevBeat["loop"])) {
      self["beat"] = beat;
      doBeatEffect(beatChar);
      callEventListeners("beat", beat);
    }

    self["beatAnalysisHandle"] = window.requestAnimationFrame(beatAnalyze);
  }

  var startBeatAnalysis = function() {
    if (!self["beatAnalysisHandle"]) {
      console.log("Starting beat analysis");
      self["beatAnalysisHandle"] = window.requestAnimationFrame(beatAnalyze);
    }
  }

  var stopBeatAnalysis = function() {
    console.log("Stopping beat analysis");
    var handle = self["beatAnalysisHandle"];
    if (handle !== null) {
      window.cancelAnimationFrame(self["beatAnalysisCallback"]);
      self["beatAnalysisHandle"] = null;
    }
    var beat = { "buildup": null, "loop": null };
    self["beat"] = beat;
    callEventListeners("beat", beat);
  }

  var getBeatString = function() {
    var beats = "";
    var length = arguments[0];
    if (typeof(length) === "undefined") {
      length = 256;
    }

    var song = self["song"];
    var beat = self["beat"];
    if (song) {
      if (beat["buildup"] !== null &&
            (typeof(song["buildupRhythm"]) !== "undefined")) {
        /* Currently in buildup */
        beats += song["buildupRhythm"].slice(beat["buildup"]);
      } else if (beat["loop"] !== null) {
        /* Currently in loop */
        beats += song["rhythm"].slice(beat["loop"]);
      } else {
        /* Song is loaded but not yet playing? */
        if (typeof(song["buildupRhythm"]) !== "undefined") {
          beats += song["buildupRhythm"];
        }
      }

      while (beats.length < length) {
        beats += song["rhythm"];
      }
    }

    return beats;
  };
  Hues["getBeatString"] = getBeatString;

  window.Hues = Hues;
})();
