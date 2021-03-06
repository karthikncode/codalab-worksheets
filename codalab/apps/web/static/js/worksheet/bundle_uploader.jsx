
var BundleUploader = React.createClass({
  getInitialState: function() {
    // Maintain a table of the currently uploading bundles.
    // The `uploading` table maps from arbitrary string keys to Web API File objects.
    return {
      uploading: {}
    };
  },
  addUploading: function(file) {
    // Append new file to table of uploading bundles
    var key = String(Math.floor(Math.random() * 10000000));
    var entry = {};
    entry[key] = file;
    this.setState({uploading: _.extend(entry, this.state.uploading)});
    return key;
  },
  clearUploading: function(key) {
    // Delete entry from table of uploading bundles
    var newUploading = _.clone(this.state.uploading);
    delete newUploading[key];
    this.setState({uploading: newUploading});
  },
  uploadBundle: function (e) {
    e.stopPropagation();
    e.preventDefault();
    $(this.refs.button.getDOMNode()).blur();

    var file = this.refs.fileDialog.getDOMNode().files[0];
    if (!file) {
      return;
    }
    this.refs.fileDialog.getDOMNode().value = null;

    var fileEntryKey = this.addUploading(file);

    var fd = new FormData();
    fd.append('file', file);
    fd.append('bundle_type', 'dataset');
    fd.append('worksheet_uuid', this.props.ws.info.uuid);
    $.ajax({
      url: '/rest/api/bundles/upload/',
      data: fd,
      processData: false,
      contentType: false,
      cache: false,
      type: 'POST',
      success: function (data, status, jqXHR) {
        this.clearUploading(fileEntryKey);
        this.props.refreshWorksheet();
      }.bind(this),
      error: function (jqHXR, status, error) {
        this.clearUploading(fileEntryKey);
        alert(jqHXR.responseText);
      }.bind(this)
    });
  },
  openFileDialog: function (e) {
    e.stopPropagation();
    e.preventDefault();

    // Artificially "clicks" on the hidden file input element.
    $(this.refs.fileDialog.getDOMNode()).trigger('click');
  },
  render: function () {
    var upload_button = (
      <Button
        text='Upload'
        type='primary'
        handleClick={this.openFileDialog}
        className="active"
        id="upload-bundle-button"
        ref="button"
        flexibleSize={true}
      />
    );
    return (
      <div className='inline-block'>
        {upload_button}
        <div id="bundle-upload-form" tabIndex="-1" aria-hidden="true">
          <form name="uploadForm" encType="multipart/form-data" method="post">
            <input id="uploadInput" type="file" ref="fileDialog" name="file" onChange={this.uploadBundle} />
          </form>
        </div>

        <div id="bundle-upload-progress-bars">
          {_.mapObject(this.state.uploading, function(file, key) {
            // TODO: show actual upload progress
            return (
              <div className="bundle-upload-progress-bar progress-bar progress-bar-striped active" role="progressbar">
                Uploading {file.name}...
              </div>
            );
          })}
        </div>

      </div>
    );
  }
});
