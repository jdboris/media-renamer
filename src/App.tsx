import React from "react";
import "./App.css";
import { stringSimilarity } from "./utils.js";
import substrings from "common-substrings";
import { API_KEY } from "./secret.js";

const URL = "http://api.themoviedb.org/3/";

enum SearchMode {
  NAME,
  STAMP,
  BOTH,
}

enum RenameStatus {
  SUCCESS,
  FAILURE,
}

enum MediaType {
  MOVIE,
  SHOW,
}

declare global {
  interface Window {
    fs: any;
  }

  interface RenameAttempt {
    oldName: string;
    newName: string;
    status: RenameStatus;
    error: string;
    warning: string;
    newFolders: Array<string>;
  }

  interface VideoFile extends File {
    path: string;
  }
}

class App extends React.Component {
  state = {
    searchMode: SearchMode.NAME,
    folderPath: "",
    mediaType: MediaType.MOVIE,
    unfoundFiles: Array<string>(),
    unmatchedEpisodes: Array<string>(),
    oldNames: Array<string>(),
    newNames: Array<string>(),
    errors: Array<string>(),
    inputKey: Date.now(),
    renameAttempts: Array<RenameAttempt>(),
    isComplete: false,
    isCanceled: false,
    fileCheckedCount: 0,
    shouldDeleteJunk: false,
  };

  shouldCancel = false;
  files = Array<VideoFile>();

  async setStateAsync(state: any) {
    return new Promise((resolve: any) => {
      this.setState(state, resolve);
    });
  }

  async getMovie(name: string) {
    let completeAddress = `${URL}search/movie?api_key=${API_KEY}&include_adult=true&query=${encodeURIComponent(
      name
    )}`;

    return fetch(completeAddress, {
      method: "GET",
    }).then((response) => {
      return response.json();
    });
  }

  async getSeriesId(name: string) {
    let completeAddress = `${URL}search/tv?api_key=${API_KEY}&include_adult=true&query=${encodeURIComponent(
      name
    )}`;

    return fetch(completeAddress, {
      method: "GET",
    })
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        if (data.results.length == 0) {
          console.error("No TV series results returned from API.");
        } else {
          return data.results[0].id;
        }
      });
  }

  async getEpisodeList(id: Number, seasonNumber: Number) {
    let completeAddress = `${URL}tv/${id}/season/${seasonNumber}?api_key=${API_KEY}`;

    return fetch(completeAddress, {
      method: "GET",
    })
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        if (!data.episodes || data.episodes.length == 0) {
          console.error("No TV series episode results returned from API.");
        } else {
          return data.episodes;
        }
      });
  }

  selectFiles = (event: any) => {
    let { files } = event.target;

    this.reset().then(() => {
      // Convert it to an array
      this.files = [...files];

      if (files.length > 0) {
        // Get the series name from the file path
        let folderName = files[0].path.substring(
          0,
          files[0].path.lastIndexOf("\\")
        );
        this.setState({ folderPath: folderName });
      }
    });
  };

  renameFiles = () => {
    this.reset().then(async () => {
      if (this.state.mediaType == MediaType.SHOW) {
        this.renameSeries();
      } else if (this.state.mediaType == MediaType.MOVIE) {
        await this.renameMovies();
      }
    });
  };

  renameSeries = async () => {
    const files = this.files;
    const SEASON_REGEX = /Season [0-9]+/i;
    const EPISODE_STAMP_REGEX = /S[0-9]+E[0-9]+/i;
    const FILE_EXTENSION_REGEX = /(?:\.([^.]+))?$/;

    if (files.length > 0) {
      // Get the series name from the file path
      let folderName = files[0].path.substring(
        0,
        files[0].path.lastIndexOf("\\")
      );

      folderName = folderName.substring(folderName.lastIndexOf("\\") + 1);

      let seasonNumber = 1;
      let matches = folderName.match(SEASON_REGEX);
      if (matches && matches.length) {
        matches = matches[0].match(/[0-9]+/i);
        if (matches && matches.length) {
          seasonNumber = Number(matches[0]);
        }
      }

      let seriesName = folderName.replace(SEASON_REGEX, "");
      let unmatchedEpisodes: Array<any> = [];

      let id = await this.getSeriesId(seriesName);
      let episodes = await this.getEpisodeList(id, seasonNumber);

      unmatchedEpisodes = episodes;

      // Get the dirty file names
      let cleanFileNames = files.map((file: any) => {
        return file.name.toLowerCase().replace(FILE_EXTENSION_REGEX, "");
        //.replace(EPISODE_STAMP_REGEX, "")
      });

      // Try to clean them by removing common substrings
      let commonStrings = substrings(cleanFileNames, {
        minLength: 3,
        /* @ts-expect-error */
        minOccurrence: parseInt(cleanFileNames.length * 0.8),
      });

      for (let str of commonStrings) {
        cleanFileNames = cleanFileNames.map((name: string) => {
          return name.replace(str.name, "");
        });
      }

      //const renameFilesRecursive = (i: number) => {
      for (let i = 0; i < files.length; i++) {
        // for (let i = 0; i < files.length; i++) {
        // Get the episode name from the file name...
        // Remove the extension
        let episodeName = cleanFileNames[i];

        // Get the episode stamp
        matches = files[i].name.match(EPISODE_STAMP_REGEX);
        let episodeStamp = "";
        if (matches && matches.length) {
          episodeStamp = matches[0];
        }

        let stampSeason = null;
        let stampEpisode = null;

        if (episodeStamp) {
          let matches = episodeStamp.match(/[0-9]+/g);
          if (matches && matches.length) {
            stampSeason = Number(matches[0]);
            stampEpisode = Number(matches[1]);

            if (stampSeason != seasonNumber) {
              stampSeason = null;
              stampEpisode = null;
            }
          }
        }

        let highest = 0;
        let matchedEpisode: any = null;

        if (
          episodeName &&
          (this.state.searchMode == SearchMode.NAME ||
            this.state.searchMode == SearchMode.BOTH)
        ) {
          // Check for a matching episode name
          for (let episode of episodes) {
            let similarity = stringSimilarity(episodeName, episode.name);

            if (similarity > 0.5 && similarity > highest) {
              highest = similarity;
              matchedEpisode = episode;
            }
          }
        }

        if (
          !matchedEpisode &&
          stampSeason !== null &&
          stampEpisode !== null &&
          (this.state.searchMode == SearchMode.STAMP ||
            this.state.searchMode == SearchMode.BOTH)
        ) {
          // Check for a matching episode stamp
          for (let episode of episodes) {
            if (
              episode.season_number == stampSeason &&
              episode.episode_number == stampEpisode
            ) {
              matchedEpisode = episode;
              break;
            }
          }
        }

        let oldFileName = files[i].name;

        if (!matchedEpisode) {
          await this.setStateAsync({
            renameAttempts: [
              ...this.state.renameAttempts,
              {
                oldName: oldFileName,
                newName: "",
                status: RenameStatus.FAILURE,
                error: "ERROR: Failed to find an episode to match local file.",
              },
            ],
            unfoundFiles: [...this.state.unfoundFiles, files[i].name],
          });
        } else {
          let s = String(matchedEpisode.season_number).padStart(2, "0");
          let e = String(matchedEpisode.episode_number).padStart(2, "0");
          let newFileName = `${seriesName} S${s}E${e} - ${matchedEpisode.name}${
            files[i].name.match(FILE_EXTENSION_REGEX)![0]
          }`;

          // Mark the episode as "matched"
          unmatchedEpisodes = unmatchedEpisodes.filter((e) => {
            return e.episode_number != matchedEpisode.episode_number;
          });

          // Sanitize the string
          newFileName = newFileName.replace(/[\/\\?:*"<>|]/g, " ");

          let previousRename = this.state.renameAttempts.find((attempt) => {
            return attempt.newName == newFileName;
          });

          if (previousRename) {
            previousRename.warning =
              "WARNING: Attempted to rename other file(s) to this same name.";

            await this.setStateAsync({
              renameAttempts: [
                ...this.state.renameAttempts,
                {
                  oldName: oldFileName,
                  newName: newFileName,
                  status: RenameStatus.FAILURE,
                  error:
                    "ERROR: Filename already taken by previous rename (marked).",
                },
              ],
            });
          } else if (window.fs.existsSync(newFileName)) {
            await this.setStateAsync({
              renameAttempts: [
                ...this.state.renameAttempts,
                {
                  oldName: oldFileName,
                  newName: newFileName,
                  status: RenameStatus.FAILURE,
                  error: "ERROR: Filename already taken (before any renaming).",
                },
              ],
            });
          } else {
            try {
              window.fs.renameSync(
                files[i].path,
                files[i].path.replace(oldFileName, newFileName)
              );
            } catch (err: any) {
              await this.setStateAsync({
                renameAttempts: [
                  ...this.state.renameAttempts,
                  {
                    oldName: files[i].path,
                    newName: files[i].path.replace(oldFileName, newFileName),
                    status: RenameStatus.FAILURE,
                    error: err.toString(),
                  },
                ],
              });
              return;
            }

            await this.setStateAsync({
              renameAttempts: [
                ...this.state.renameAttempts,
                {
                  oldName: oldFileName,
                  newName: newFileName,
                  status: RenameStatus.SUCCESS,
                },
              ],

              oldNames: [...this.state.oldNames, oldFileName],
              newNames: [...this.state.newNames, newFileName],
            });
          }
        }
      }

      this.setState({
        unmatchedEpisodes: unmatchedEpisodes,
        isComplete: true,
      });
    }
  };

  renameMovies = async () => {
    const files = this.files;
    this.shouldCancel = false;
    const SEPARATORS_REGEX = /[-_.+\\|\/]/g;
    const OTHER_CHARACTERS_REGEX = /[`~@#$%^&*(){}[\],;"]/g;
    const YEAR_REGEX = /([1-2]{1}[0-9]{3})/;
    const FILE_EXTENSION_REGEX = /(?:\.([^.]+))?$/;
    const SUBTITLE_FILE_EXTENSION_REGEX = /(?:\.([^.]+)\.([^.]+))?$/;
    const SUBTITLE_EXTENSIONS = [".srt", ".smi", ".ssa", ".ass", ".vtt"];

    for (let i = 0; i < files.length; i++) {
      if (this.shouldCancel) {
        this.setState({ isCanceled: true });
        return;
      }

      await this.setStateAsync({ fileCheckedCount: i + 1 });

      let file = files[i];
      let extension = file.name.match(FILE_EXTENSION_REGEX)![0];

      if (window.fs.existsSync(file.path)) {
        // Delete all non-video files (existing subtitles, posters, etc)
        if (file.type.includes("video") == false) {
          if (this.state.shouldDeleteJunk) {
            if (SUBTITLE_EXTENSIONS.includes(extension)) {
              let pathWithoutExtension = file.path.replace(
                SUBTITLE_FILE_EXTENSION_REGEX,
                ""
              );

              let matchingVideoFile = files.find((other) => {
                let otherPath = other.path.replace(FILE_EXTENSION_REGEX, "");
                return other != file && pathWithoutExtension == otherPath;
              });

              // If this subtitle file has a matching video file (same path/name)
              if (matchingVideoFile) {
                continue;
              }
            }

            try {
              window.fs.unlinkSync(file.path);
            } catch (err: any) {
              console.error(err.toString());
            }
          }

          continue;
        }

        let title = file.name;
        let matches = title.match(YEAR_REGEX);
        let year = matches ? (matches.length ? matches[0] : null) : null;
        title = title.replace(FILE_EXTENSION_REGEX, "");
        title = title.split(YEAR_REGEX)[0];
        title = title.replace(SEPARATORS_REGEX, " ");
        title = title.replace(OTHER_CHARACTERS_REGEX, "");

        let data = await this.getMovie(title);

        let match = null;
        let highest = 0;

        if (!data.results || data.results.length == 0) {
          console.error(`No movie results returned from API (${title}).`);
        } else {
          for (let result of data.results) {
            let resultYear = result.release_date
              ? result.release_date.split("-")[0]
              : null;

            let similarity = stringSimilarity(title, result.title);
            // Manuall increase the similarity score if the years match
            if (resultYear && year && year == resultYear) {
              similarity += 0.1;
            }

            if (similarity >= 0.8 && similarity > highest) {
              match = result;
              highest = similarity;
            }
          }
        }

        if (!match) {
          await this.setStateAsync({
            renameAttempts: [
              ...this.state.renameAttempts,
              {
                oldName: file.name,
                newName: "",
                status: RenameStatus.FAILURE,
                error: "ERROR: No match found for file.",
              },
            ],
          });
        } else {
          let year = match.release_date
            ? match.release_date.split("-")[0]
            : null;

          // Sanitize the string
          let sanitaryName = match.title.replace(/[\/\\?:*"<>|]/g, " ");
          let oldFolderName = file.path.replace(`\\${file.name}`, "");
          let newFolderName = `${this.state.folderPath}\\${sanitaryName} (${year})`;
          let newName = `${newFolderName}\\${sanitaryName} (${year})${extension}`;

          // Make the folder if it doesn't exist
          if (!window.fs.existsSync(newFolderName)) {
            window.fs.mkdirSync(newFolderName);
          }

          // If it already has the right name, skip it
          if (window.fs.existsSync(newName)) {
            continue;
          }

          try {
            window.fs.renameSync(files[i].path, newName);
          } catch (err: any) {
            await this.setStateAsync({
              renameAttempts: [
                ...this.state.renameAttempts,
                {
                  oldName: file.path.replace(this.state.folderPath + "\\", ""),
                  newName: newName.replace(this.state.folderPath + "\\", ""),
                  status: RenameStatus.FAILURE,
                  error: err.toString(),
                },
              ],
            });
            continue;
          }

          await this.setStateAsync({
            renameAttempts: [
              ...this.state.renameAttempts,
              {
                oldName: file.path.replace(this.state.folderPath + "\\", ""),
                newName: newName.replace(this.state.folderPath + "\\", ""),
                status: RenameStatus.SUCCESS,
              },
            ],
          });

          // If the file was in a sub-folder with the wrong name before
          if (oldFolderName != newFolderName) {
            if (oldFolderName == this.state.folderPath) {
              await this.setStateAsync({
                renameAttempts: [
                  ...this.state.renameAttempts,
                  {
                    oldName: "",
                    newName: newFolderName.replace(
                      this.state.folderPath + "\\",
                      ""
                    ),
                    status: RenameStatus.SUCCESS,
                    warning: "Folder created.",
                  },
                ],
              });

              continue;
            } else {
              let files = [];
              try {
                files = window.fs.readdirSync(oldFolderName);
              } catch (err: any) {
                console.error(err);
                continue;
              }

              // If the old folder is now EMPTY
              if (!files.length) {
                window.fs.rmdirSync(oldFolderName);

                await this.setStateAsync({
                  renameAttempts: [
                    ...this.state.renameAttempts,
                    {
                      oldName: oldFolderName.replace(
                        this.state.folderPath + "\\",
                        ""
                      ),
                      newName: newFolderName.replace(
                        this.state.folderPath + "\\",
                        ""
                      ),
                      status: RenameStatus.SUCCESS,
                      warning: "Folder renamed.",
                    },
                  ],
                });
              } else {
                await this.setStateAsync({
                  renameAttempts: [
                    ...this.state.renameAttempts,
                    {
                      oldName: oldFolderName.replace(
                        this.state.folderPath + "\\",
                        ""
                      ),
                      newName: "",
                      status: RenameStatus.FAILURE,
                      warning:
                        "Old folder could not be deleted. Folder still has contents.",
                    },
                  ],
                });
              }
            }
          }
        }
      }
    }

    this.setState({
      isComplete: true,
    });
  };

  undoAllRenames = () => {
    new Promise((resolve: any) => {
      for (let renameAttempt of this.state.renameAttempts) {
        if (renameAttempt.status == RenameStatus.SUCCESS) {
          let oldPath = this.state.folderPath + "\\" + renameAttempt.oldName;
          let newPath = this.state.folderPath + "\\" + renameAttempt.newName;
          let isFolder =
            window.fs.existsSync(newPath) &&
            window.fs.lstatSync(newPath).isDirectory();

          if (isFolder && renameAttempt.oldName == "") {
            window.fs.rmdirSync(newPath);
          } else {
            window.fs.renameSync(newPath, oldPath);
          }
        }
      }
      resolve();
    }).then(() => {
      this.reset();
    });
  };

  async reset() {
    return new Promise((resolve: any) => {
      this.setState(
        {
          //folderPath: "",
          unfoundFiles: [],
          unmatchedEpisodes: [],
          oldNames: [],
          newNames: [],
          inputKey: Date.now(),
          renameAttempts: [],
          isComplete: false,
          isCanceled: false,
          fileCheckedCount: 0,
        },
        resolve
      );
    });
  }

  render() {
    return (
      <div>
        <button
          onClick={() => {
            this.shouldCancel = true;
          }}
        >
          Cancel
        </button>
        <input
          key={this.state.inputKey}
          type="file"
          /* @ts-expect-error */
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={this.selectFiles}
        />
        <button onClick={this.renameFiles}>Rename All</button>
        <select
          value={this.state.mediaType}
          onChange={(event) => {
            this.setState({ mediaType: event.target.value });
          }}
        >
          <option value={MediaType.SHOW}>Show</option>
          <option value={MediaType.MOVIE}>Movie</option>
        </select>

        {this.state.mediaType == MediaType.MOVIE ? (
          <label>
            <input
              type="checkbox"
              onChange={(event) => {
                this.setState({ shouldDeleteJunk: event.target.checked });
              }}
            />
            Delete Junk
          </label>
        ) : (
          ""
        )}

        {this.state.mediaType == MediaType.SHOW ? (
          <select
            value={this.state.searchMode}
            onChange={(event) => {
              this.setState({ searchMode: event.target.value });
            }}
          >
            <option value={SearchMode.NAME}>Name</option>
            <option value={SearchMode.STAMP}>Stamp</option>
            <option value={SearchMode.BOTH}>Both</option>
          </select>
        ) : (
          ""
        )}
        {this.state.fileCheckedCount ? (
          <h5 className="red">Files checked: {this.state.fileCheckedCount}</h5>
        ) : (
          ""
        )}
        {this.state.isCanceled ? <h1 className="error">Canceled!</h1> : ""}
        {this.state.folderPath ? (
          <div>
            <strong>Folder: </strong> {this.state.folderPath}
          </div>
        ) : (
          ""
        )}
        <div>
          {this.state.renameAttempts.length ? (
            <div>
              <h3>
                Renames <button onClick={this.undoAllRenames}>Undo</button>
              </h3>
              <ul>
                {this.state.renameAttempts.map((rename, i) => {
                  return (
                    <li>
                      "{rename.oldName}" <strong>-&gt;</strong>
                      <br /> "{rename.newName}"
                      <div className="error">{rename.error}</div>
                      <div className="warning">{rename.warning}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            ""
          )}

          {this.state.isComplete ? <h1 className="green">Complete!</h1> : ""}

          {this.state.unfoundFiles.length ? (
            <div>
              <h3>Files that couldn't be renamed</h3>
              <ul>
                {this.state.unfoundFiles.map((fileName) => {
                  return <li>{fileName}</li>;
                })}
              </ul>
            </div>
          ) : (
            ""
          )}

          {this.state.unmatchedEpisodes.length ? (
            <div>
              <h3>Episodes without a local match</h3>
              <ul>
                {this.state.unmatchedEpisodes.map((episode: any) => {
                  return (
                    <li>
                      S{String(episode.season_number).padStart(2, "0")}E
                      {String(episode.episode_number).padStart(2, "0")} -{" "}
                      {episode.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            ""
          )}
        </div>
      </div>
    );
  }
}

export default App;
