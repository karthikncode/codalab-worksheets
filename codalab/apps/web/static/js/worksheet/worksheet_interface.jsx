
/*
Main worksheet page, which displays information about a single worksheet.
Consists of three main components:
- action bar (web terminal)
- list of worksheets
- side panel
*/

var Worksheet = React.createClass({
    getInitialState: function() {
        return {
            ws: new WorksheetContent(this.props.uuid),
            version: 0,  // Increment when we refresh
            escCount: 0, // Increment when the user presses esc keyboard shortcut, a hack to allow esc shortcut to work
            activeComponent: 'list',  // Where the focus is (action, list, or side_panel)
            editMode: false,  // Whether we're editing the worksheet
            editorEnabled: false, // Whether the editor is actually showing (sometimes lags behind editMode)
            showActionBar: true,  // Whether the action bar is shown
            focusIndex: -1,  // Which worksheet items to be on (-1 is none)
            subFocusIndex: 0,  // For tables, which row in the table
            numOfBundles: -1, // Number of bundles in this worksheet (-1 is just the initial value)
            focusedBundleUuidList: [], // Uuid of the focused bundle and that of all bundles after it
            userInfo: null, // User info of the current user. (null is the default)
        };
    },

    _setfocusIndex: function(index) {
        this.setState({focusIndex: index});
    },
    _setWorksheetSubFocusIndex: function(index) {
        this.setState({subFocusIndex: index});
    },

    // Return the number of rows occupied by this item.
    _numTableRows: function(item) {
      if (item) {
        if (item.mode == 'table')
          return item.bundle_info.length;
        if (item.mode == 'wsearch')
          return item.interpreted.items.length;
        if (item.mode == 'search') {
          var subitem = item.interpreted.items[0];
          return subitem != null ? subitem.bundle_info.length : null;
        }
      } else {
        return null;
      }
    },

    setFocus: function(index, subIndex, shouldScroll) {
        if (shouldScroll === undefined) shouldScroll = true;
        //console.log('setFocus', index, subIndex);
        var info = this.state.ws.info;
        // resolve to the last item that contains bundle(s)
        if (index === 'end') {
            index = -1;
            for (var i = info.items.length - 1; i >= 0; i--) {
                if (info.items[i].bundle_info) {
                    index = i;
                    break;
                }
            }
        }
        // resolve to the last row of the selected item
        if (subIndex === 'end') {
            subIndex = (this._numTableRows(info.items[index]) || 1) - 1;
        }
        if (index < -1 || index >= info.items.length || subIndex < -1 || subIndex >= (this._numTableRows(info.items[index]) || 1)) {
          console.log('out of bound')
          return;  // Out of bounds (note index = -1 is okay)
        }
        if (index !== -1) {
            // index !== -1 means something is selected.
            // focusedBundleUuidList is a list of uuids of all bundles after the selected bundle (itself included)
            // Say the selected bundle has focusIndex 1 and subFocusIndex 2, then focusedBundleUuidList will include the uuids of
            // all the bundles that have focusIndex 1 and subFocusIndex >= 2, and also all the bundles that have focusIndex > 1
            var focusedBundleUuidList = [];
            for (var i = index; i < info.items.length; i++) {
                var bundle_info = this.ensureIsArray(info.items[i].bundle_info);
                if (bundle_info) {
                    var j = i === index ? subIndex : 0;
                    for (; j < (this._numTableRows(info.items[i]) || 1); j++) {
                        focusedBundleUuidList.push(bundle_info[j].uuid);
                    }
                }
            }
        }
        // Change the focus - triggers updating of all descendants.
        this.setState({focusIndex: index, subFocusIndex: subIndex, focusedBundleUuidList: focusedBundleUuidList});
        if (shouldScroll) this.scrollToItem(index, subIndex);
    },

    scrollToItem: function(index, subIndex) {
        // scroll the window to keep the focused element in view if needed
        var __innerScrollToItem = function(index, subIndex) {
          // Compute the current position of the focused item.
          var pos;
          if (index == -1) {
            pos = -1000000;  // Scroll all the way to the top
          } else {
            var item = this.refs.list.refs['item' + index];
            if (this._numTableRows(item.props.item) != null)
              item = item.refs['row' + subIndex];  // Specifically, the row
            var node = item.getDOMNode();
            pos = node.getBoundingClientRect().top;
          }
          keepPosInView(pos);
        };

        // Throttle so that if keys are held down, we don't suffer a huge lag.
        if (this.throttledScrollToItem === undefined)
            this.throttledScrollToItem = _.throttle(__innerScrollToItem, 50).bind(this);
        this.throttledScrollToItem(index, subIndex);
    },

    componentWillMount: function() {
        this.state.ws.fetch({
          success: function(data) {
              $('#worksheet-message').hide();
              $('#worksheet_content').show();
              this.setState({updating: false, version: this.state.version + 1, numOfBundles: this.getNumOfBundles()});
              // Fix out of bounds.
          }.bind(this),
          error: function(xhr, status, err) {
              $("#worksheet-message").html(xhr.responseText).addClass('alert-danger alert');
              $('#worksheet_container').hide();
          }.bind(this)
        });
    },

    componentDidMount: function() {
        // Initialize history stack
        window.history.replaceState({uuid: this.state.ws.uuid}, '', window.location.pathname);
        $('body').addClass('ws-interface');
        $.ajax({
        url: '/rest/api/users/',
            dataType: 'json',
            cache: false,
            type: 'GET',
            success: function(data) {
                this.setState({
                    userInfo: data.user_info
                });
            }.bind(this),
            error: function(xhr, status, err) {
                console.error(xhr.responseText);
            }.bind(this)
        });
    },

    canEdit: function() {
        var info = this.state.ws.info;
        return info && info.edit_permission;
    },
    viewMode: function() {
        this.toggleEditMode(false, true);
    },
    discardChanges: function() {
        this.toggleEditMode(false, false);
    },
    editMode: function() {
        this.toggleEditMode(true);
    },
    handleActionBarFocus: function(event) {
        this.setState({activeComponent: 'action'});
        // just scroll to the top of the page.
        // Add the stop() to keep animation events from building up in the queue
        // See also scrollTo* methods
        $('#worksheet_panel').addClass('actionbar-focus');
        $('#command_line').data('resizing', null);
        $('body').stop(true).animate({scrollTop: 0}, 250);
    },
    handleActionBarBlur: function(event) {
        // explicitly close term because we're leaving the action bar
        // $('#command_line').terminal().focus(false);
        this.setState({activeComponent: 'list'});
        $('#command_line').data('resizing', null);
        $('#worksheet_panel').removeClass('actionbar-focus').removeAttr('style');
        $('#ws_search').removeAttr('style');
    },
    setupEventHandlers: function() {
        var self = this;
        // Load worksheet from history when back/forward buttons are used.
        window.onpopstate = function(event) {
            if (event.state == null) return;
            this.setState({ws: new WorksheetContent(event.state.uuid)});
            this.refreshWorksheet();
        }.bind(this);

        Mousetrap.reset();

        if (this.state.activeComponent == 'action') {
            // no need for other keys, we have the action bar focused
            return;
        }

        // No keyboard shortcuts are active in edit mode
        if (this.state.editMode) {
            Mousetrap.bind(['ctrl+enter', "meta+enter"], function(e) {
                this.toggleEditMode();
            }.bind(this));
            return;
        }

        Mousetrap.bind(['?'], function(e) {
            $('#glossaryModal').modal('show');
        });

        Mousetrap.bind(['esc'], function(e) {
            if ($('#glossaryModal').hasClass('in')) {
                $('#glossaryModal').modal('hide');
            }
            ContextMenuMixin.closeContextMenu();
            self.setState({escCount: self.state.escCount + 1});
        });

        Mousetrap.bind(['shift+r'], function(e) {
            this.refreshWorksheet();
            return false;
        }.bind(this));

        // Show/hide web terminal (action bar)
        Mousetrap.bind(['shift+c'], function(e) {
            this.toggleActionBar();
        }.bind(this));

        // Focus on web terminal (action bar)
        Mousetrap.bind(['c'], function(e) {
            this.focusActionBar();
        }.bind(this));

        // Toggle edit mode
        Mousetrap.bind(['e'], function(e) {
            this.toggleEditMode();
            return false;
        }.bind(this));
    },

    toggleEditMode: function(editMode, saveChanges) {
        if (editMode === undefined)
          editMode = !this.state.editMode;  // Toggle by default

        if (saveChanges === undefined)
          saveChanges = true;

        if (!editMode) {
          // Going out of raw mode - save the worksheet.
          if (this.canEdit()) {
            var info = this.state.ws.info;
            var editor = ace.edit('worksheet-editor');
            if (saveChanges) {
              info.raw = editor.getValue().split('\n');
            }
            var rawIndex = editor.getCursorPosition().row;
            var focusIndexPair;
            if (rawIndex >= info.raw_to_interpreted.length) {
              // Happens when things are inserted at the end
              focusIndexPair = [info.raw_to_interpreted.length - 1, 0];
            } else {
              focusIndexPair = info.raw_to_interpreted[rawIndex];
            }
            if (focusIndexPair == null) {
              console.error('Can\'t map raw index ' + rawIndex + ' to item index pair');
              focusIndexPair = [0, 0];  // Fall back to default
            }
            this.setState({
                editMode: editMode,
                editorEnabled: false,
                focusIndex: focusIndexPair[0],
                subFocusIndex: focusIndexPair[1],
            });  // Needs to be after getting the raw contents
            this.saveAndUpdateWorksheet(saveChanges);
          } else {
            // Not allowed to edit the worksheet.
            this.setState({
                editMode: editMode,
                editorEnabled: false,
            });
          }
        } else {
          // Go into edit mode.
          this.setState({editMode: editMode});  // Needs to be before focusing
          $("#worksheet-editor").focus();
        }
    },

    componentDidUpdate: function(props,state,root) {
        if (this.state.editMode && !this.state.editorEnabled) {
            this.setState({editorEnabled: true});
            var editor = ace.edit('worksheet-editor');
            editor.$blockScrolling = Infinity;
            editor.session.setUseWrapMode(false);
            editor.setShowPrintMargin(false);
            editor.session.setMode('ace/mode/markdown');
            if (!this.canEdit()) {
              editor.setOptions({
                  readOnly: true,
                  highlightActiveLine: false,
                  highlightGutterLine: false
              });
              editor.renderer.$cursorLayer.element.style.opacity=0;
            } else {
              editor.commands.addCommand({
                  name: 'save',
                  bindKey: {win: 'Ctrl-Enter', mac: 'Command-Enter'},
                  exec: function(editor) {
                      this.toggleEditMode();
                  }.bind(this),
                  readOnly: true
              });
              editor.focus();

              var rawIndex;
              var cursorColumnPosition;
              if (this.state.focusIndex == -1) { // Above the first item
                rawIndex = 0;
                cursorColumnPosition = 0;
              } else {
                var item = this.state.ws.info.items[this.state.focusIndex];
                // For non-tables such as search and wsearch, we have subFocusIndex, but not backed by raw items, so use 0.
                var focusIndexPair = this.state.focusIndex + ',' + (item.mode == 'table' ? this.state.subFocusIndex : 0);
                rawIndex = this.state.ws.info.interpreted_to_raw[focusIndexPair];
              }

              if (rawIndex === undefined) {
                  console.error('Can\'t map %s (focusIndex %d, subFocusIndex %d) to raw index', focusIndexPair, this.state.focusIndex, this.state.subFocusIndex);
                  console.log(this.state.ws.info.interpreted_to_raw);
                  return;
              }
              if (cursorColumnPosition === undefined)
                cursorColumnPosition = editor.session.getLine(rawIndex).length;  // End of line
              editor.gotoLine(rawIndex + 1, cursorColumnPosition);
              editor.renderer.scrollToRow(rawIndex);
            }
        }
    },

    toggleActionBar: function() {
        this.setState({showActionBar: !this.state.showActionBar});
    },

    focusActionBar: function() {
        this.setState({activeComponent: 'action'});
        this.setState({showActionBar: true});
        $('#command_line').terminal().focus();
    },

    ensureIsArray: function(bundle_info) {
      if (!bundle_info) return null;
      if (!Array.isArray(bundle_info)) {
        bundle_info = [bundle_info];
      }
      return bundle_info;
    },

    getNumOfBundles: function() {
      var items = this.state.ws.info && this.state.ws.info.items;
      if (!items) return 0;
      var count = 0;
      for (var i = 0; i < items.length; i++) {
        var bundle_info = this.ensureIsArray(items[i].bundle_info);
        if (bundle_info) {
          count += bundle_info.length;
        }
      }
      return count;
    },

    getFocusAfterBundleRemoved: function(items) {
      var items = this.state.ws.info && this.state.ws.info.items;
      if (!items) return null;
      for (var i = 0; i < this.state.focusedBundleUuidList.length; i++) {
        for (var index = 0; index < items.length; index++) {
          var bundle_info = this.ensureIsArray(items[index].bundle_info);
          if (bundle_info) {
            for (var subIndex = 0; subIndex < (this._numTableRows(items[index]) || 1); subIndex++) {
              if (bundle_info[subIndex].uuid == this.state.focusedBundleUuidList[i])
                return [index, subIndex];
            }
          }
        }
      }
      // there is no next bundle, use the last bundle
      return ['end', 'end'];
    },

    refreshWorksheet: function() {
        $('#update_progress').show();
        this.setState({updating: true});
        this.state.ws.fetch({
            success: function(data) {
                $('#update_progress, #worksheet-message').hide();
                $('#worksheet_content').show();
                var numOfBundles = this.getNumOfBundles();
                if (this.state.numOfBundles !== -1 && numOfBundles > this.state.numOfBundles) {
                    // If the number of bundles increases then the focus should be on the new bundles.
                    this.setFocus('end', 'end');
                } else if (numOfBundles < this.state.numOfBundles) {
                    // If the number of bundles decreases, then focus should be on the same bundle as before
                    // unless that bundle doesn't exist anymore, in which case we select the closest bundle that does exist,
                    // where closest means 'next' by default or 'last' if there is no next bundle.
                    var focus = this.getFocusAfterBundleRemoved();
                    if (focus !== null) {
                      this.setFocus(focus[0], focus[1]);
                    }
                }
                this.setState({updating: false, version: this.state.version + 1, numOfBundles: numOfBundles});
            }.bind(this),
            error: function(xhr, status, err) {
                this.setState({updating: false});
                $("#worksheet-message").html(xhr.responseText).addClass('alert-danger alert');
                $('#update_progress').hide();
                $('#worksheet_container').hide();
            }.bind(this)
        });
    },

    openWorksheet: function(uuid) {
      // Change to a different worksheet. This does not call refreshWorksheet().
      this.setState({ws: new WorksheetContent(uuid)});

      // Note: this is redundant if we're doing 'cl work' from the action bar,
      // but is necessary if triggered in other ways.
      this.refreshWorksheet();

      // Create a new entry in the browser history with new URL.
      window.history.pushState({uuid: this.state.ws.uuid}, '', '/worksheets/' + uuid + '/');
    },

    saveAndUpdateWorksheet: function(from_raw) {
        $("#worksheet-message").hide();
        this.setState({updating: true});
        this.state.ws.saveWorksheet({
            success: function(data) {
                this.setState({updating: false});
                this.refreshWorksheet();
            }.bind(this),
            error: function(xhr, status, err) {
                this.setState({updating: false});
                $('#update_progress').hide();
                $('#save_error').show();
                $("#worksheet-message").html(xhr.responseText).addClass('alert-danger alert').show();
                if (from_raw) {
                    this.toggleEditMode(true);
                }
            }
        });
    },

    render: function() {
        this.setupEventHandlers();
        var info = this.state.ws.info;
        var rawWorksheet = info && info.raw.join('\n');
        var editPermission = info && info.edit_permission;
        var canEdit = this.canEdit() && this.state.editMode;

        var searchClassName   = !this.state.showActionBar ? 'search-hidden' : '';
        var editableClassName = canEdit ? 'editable' : '';
        var viewClass         = !canEdit && !this.state.editMode ? 'active' : '';
        var rawClass          = this.state.editMode ? 'active' : '';
        var disableWorksheetEditing = this.canEdit() ? '' : 'disabled';
        var sourceStr = editPermission ? 'Edit source' : 'View source';
        var editFeatures = (
            <div className="edit-features">
                <div className="btn-group">
                    <button className={viewClass} onClick={this.viewMode}>View</button>
                    <button className={rawClass} onClick={this.editMode}>{sourceStr}</button>
                </div>
            </div>
        );

        var editModeFeatures = (
            <div className="edit-features">
                <div className="btn-group">
                    <button className={viewClass} onClick={this.viewMode} disabled={disableWorksheetEditing}>Save</button>
                    <button className={viewClass} onClick={this.discardChanges}>Discard</button>
                </div>
            </div>
        );

        if (info && info.items.length) {
            // Non-empty worksheet
        } else {
            $('.empty-worksheet').fadeIn();
        }

        var raw_display = <div>
            Press ctrl-enter to save.
            See <a href="https://github.com/codalab/codalab-worksheets/wiki/User_Worksheet-Markdown">markdown syntax</a>.
            <div id='worksheet-editor'>{rawWorksheet}</div>
            </div>;

        var action_bar_display = (
                <WorksheetActionBar
                    ref={"action"}
                    ws={this.state.ws}
                    handleFocus={this.handleActionBarFocus}
                    handleBlur={this.handleActionBarBlur}
                    active={this.state.activeComponent == 'action'}
                    refreshWorksheet={this.refreshWorksheet}
                    openWorksheet={this.openWorksheet}
                    editMode={this.editMode}
                    setFocus={this.setFocus}
                />
            );
        // chat_box only appears if ENABLE_CHAT flag is on in website-config.json and the current user is NOT root user
        var chat_box_display = info && info.enable_chat && this.state.userInfo && !this.state.userInfo.is_root_user ? (
                <WorksheetChatBox
                    ws={this.state.ws}
                    focusIndex={this.state.focusIndex}
                    subFocusIndex={this.state.subFocusIndex}
                    userInfo={this.state.userInfo}
                />
            ): null;

        // chat_portal only appears if ENABLE_CHAT flag is on in website-config.json and the current user is root user
        var chat_portal = info && info.enable_chat && this.state.userInfo && this.state.userInfo.is_root_user ? (
                <WorksheetChatPortal
                    userInfo={this.state.userInfo}
                />
            ): null;

        var items_display = (
                <WorksheetItemList
                    ref={"list"}
                    active={this.state.activeComponent == 'list'}
                    ws={this.state.ws}
                    version={this.state.version}
                    canEdit={canEdit}
                    focusIndex={this.state.focusIndex}
                    subFocusIndex={this.state.subFocusIndex}
                    setFocus={this.setFocus}
                    refreshWorksheet={this.refreshWorksheet}
                    openWorksheet={this.openWorksheet}
                    focusActionBar={this.focusActionBar}
                    ensureIsArray={this.ensureIsArray}
                />
            );

        var context_menu_display = (
            <ContextMenu />
        );

        var worksheet_side_panel = (
                <WorksheetSidePanel
                    ref={"side_panel"}
                    active={this.state.activeComponent == 'side_panel'}
                    ws={this.state.ws}
                    focusIndex={this.state.focusIndex}
                    subFocusIndex={this.state.subFocusIndex}
                    uploadBundle={this.uploadBundle}
                    bundleMetadataChanged={this.refreshWorksheet}
                    escCount={this.state.escCount}
                    userInfo={this.state.userInfo}
                />
            );

        var worksheet_display = this.state.editMode ? raw_display : items_display;
        var editButtons = this.state.editMode ? editModeFeatures : editFeatures;

        return (
            <div id="worksheet" className={searchClassName}>
                {action_bar_display}
                {chat_box_display}
                {chat_portal}
                {context_menu_display}
                <div id="worksheet_panel" className="actionbar-focus">
                    {worksheet_side_panel}
                    <div className="ws-container">
                        <div className="container-fluid">
                            <div id="worksheet_content" className={editableClassName}>
                                <div className="header-row">
                                    <div className="row">
                                        <div className="col-sm-6 col-md-8">
                                          <h4 className='worksheet-title'><WorksheetEditableField canEdit={this.canEdit()} fieldName="title" value={info && info.title} uuid={info && info.uuid} onChange={this.refreshWorksheet} /></h4>
                                        </div>
                                        <div className="col-sm-6 col-md-4">
                                            <div className="controls">
                                                <a href="#" data-toggle="modal" data-target="#glossaryModal" className="glossary-link"><code>?</code> Keyboard Shortcuts</a>
                                                {editButtons}
                                            </div>
                                        </div>
                                    </div>
                                    <hr />
                                </div>
                                {worksheet_display}
                            </div>
                        </div>
                    </div>
                </div>
                <div id="dragbar_vertical" className="dragbar"></div>
            </div>
        )
    }
});

// Extract worksheet UUID from URI path.
var uuid = window.location.pathname.match(/^\/?worksheets\/([^\/]*)/i)[1];

// Create and render the rood node.
React.render(<Worksheet uuid={uuid} />, document.getElementById('worksheet_container'));
