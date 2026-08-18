// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useRef, useState } from 'react';
import Editor, { loader, Monaco } from '@monaco-editor/react';
import openscadEditorOptions from '../language/openscad-editor-options.ts';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { MenuItem } from 'primereact/menuitem';
import { Menu } from 'primereact/menu';
import { buildUrlForStateParams } from '../state/fragment-state.ts';
import { getBlankProjectState, defaultSourcePath } from '../state/initial-state.ts';
import { ModelContext, FSContext } from './contexts.ts';
import FilePicker, {  } from './FilePicker.tsx';

// const isMonacoSupported = false;
const isMonacoSupported = (() => {
  const ua = window.navigator.userAgent;
  const iosWk = ua.match(/iPad|iPhone/i) && ua.match(/WebKit/i);
  const android = ua.match(/Android/i);
  return !(iosWk || android);
})();

let monacoInstance: Monaco | null = null;
if (isMonacoSupported) {
  loader.init().then(mi => monacoInstance = mi);
}

export default function EditorPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const menu = useRef<Menu>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const state = model.state;

  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null)

  // Name-entry dialog used by "New file" and "Copy to new file".
  const [nameDialog, setNameDialog] = useState<null | {mode: 'new' | 'copy', title: string}>(null);
  const [pendingName, setPendingName] = useState('');

  const suggestCopyName = () => {
    const p = state.params.activePath;
    const slash = p.lastIndexOf('/');
    const dir = p.substring(0, slash + 1);
    const base = p.substring(slash + 1);
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.substring(0, dot) : base;
    const ext = dot > 0 ? base.substring(dot) : '.scad';
    return `${dir}${stem}-copy${ext}`;
  };

  const confirmNameDialog = () => {
    const name = pendingName.trim();
    if (name === '' || !nameDialog) return;
    if (nameDialog.mode === 'new') {
      model.newFile(name);
    } else {
      model.copyToNewFile(name);
    }
    setNameDialog(null);
    setPendingName('');
  };

  const onUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await model.uploadFiles(files);
    }
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
  };

  if (editor) {
    const checkerRun = state.lastCheckerRun;
    const editorModel = editor.getModel();
    if (editorModel) {
      if (checkerRun && monacoInstance) {
        monacoInstance.editor.setModelMarkers(editorModel, 'openscad', checkerRun.markers);
      }
    }
  }

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.addAction({
      id: "openscad-render",
      label: "Render OpenSCAD",
      run: () => model.render({isPreview: false, now: true})
    });
    editor.addAction({
      id: "openscad-preview",
      label: "Preview OpenSCAD",
      run: () => model.render({isPreview: true, now: true})
    });
    editor.addAction({
      id: "openscad-save-do-nothing",
      label: "Save (disabled)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {}
    });
    editor.addAction({
      id: "openscad-save-project",
      label: "Save OpenSCAD project",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
      run: () => model.saveProject()
    });
    setEditor(editor)
  }

  return (
    <div className={`editor-panel ${className ?? ''}`} style={{
      // maxWidth: '5 0vw',
      display: 'flex',
      flexDirection: 'column',
      // position: 'relative',
      // width: '100%', height: '100%',
      ...(style ?? {})
    }}>
      <div className='flex flex-row gap-2' style={{
        margin: '5px',
      }}>
          
        <Menu model={[
          {
            label: "New project",
            icon: 'pi pi-plus-circle',
            command: () => window.open(buildUrlForStateParams(getBlankProjectState()), '_blank'),
            target: '_blank',
          },
          {
            // TODO: share text, title and rendering image
            // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
            label: 'Share project',
            icon: 'pi pi-share-alt',
            disabled: true,
          },
          {
            separator: true
          },  
          {
            // TODO: popup to ask for file name
            label: "New file",
            icon: 'pi pi-plus',
            command: () => {
              setPendingName('/untitled.scad');
              setNameDialog({mode: 'new', title: 'New file'});
            },
          },
          {
            label: "Copy to new file",
            icon: 'pi pi-clone',
            command: () => {
              setPendingName(suggestCopyName());
              setNameDialog({mode: 'copy', title: 'Copy to new file'});
            },
          },
          {
            label: "Upload file(s)",
            icon: 'pi pi-upload',
            command: () => fileInputRef.current?.click(),
          },
          {
            label: 'Download sources',
            icon: 'pi pi-download',
            command: () => model.saveProject(),
          },
          {
            separator: true
          },
          {
            separator: true
          },
          {
            label: 'Select All',
            icon: 'pi pi-info-circle',
            command: () => editor?.trigger(state.params.activePath, 'editor.action.selectAll', null),
          },
          {
            separator: true
          },
          {
            label: 'Find',
            icon: 'pi pi-search',
            command: () => editor?.trigger(state.params.activePath, 'actions.find', null),
          },
        ] as MenuItem[]} popup ref={menu} />
        <Button title="Editor menu" rounded text icon="pi pi-ellipsis-h" onClick={(e) => menu.current && menu.current.toggle(e)} />
        
        <FilePicker 
            style={{
              flex: 1,
            }}/>

        {state.params.activePath !== defaultSourcePath && 
          <Button icon="pi pi-chevron-left" 
          text
          onClick={() => model.openFile(defaultSourcePath)} 
          title={`Go back to ${defaultSourcePath}`}/>}

      </div>

      
      <div style={{
        position: 'relative',
        flex: 1
      }}>
        {isMonacoSupported && (
          <Editor
            className="openscad-editor absolute-fill"
            defaultLanguage="openscad"
            path={state.params.activePath}
            value={model.source}
            onChange={s => model.source = s ?? ''}
            onMount={onMount} // TODO: This looks a bit silly, does it trigger a re-render??
            options={{
              ...openscadEditorOptions,
              fontSize: 16,
              lineNumbers: state.view.lineNumbers ? 'on' : 'off',
            }}
          />
        )}
        {!isMonacoSupported && (
          <InputTextarea 
            className="openscad-editor absolute-fill"
            value={model.source}
            onChange={s => model.source = s.target.value ?? ''}  
          />
        )}
      </div>

      <div style={{
        display: state.view.logs ? undefined : 'none',
        overflowY: 'scroll',
        height: 'calc(min(200px, 30vh))',
      }}>
        {(state.currentRunLogs ?? []).map(([type, text], i) => (
          <pre key={i}>{text}</pre>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{display: 'none'}}
        onChange={onUploadInputChange}
      />

      <Dialog
        header={nameDialog?.title ?? 'New file'}
        visible={!!nameDialog}
        onHide={() => { setNameDialog(null); setPendingName(''); }}
        footer={
          <div>
            <Button label="Cancel" icon="pi pi-times" className="p-button-text"
              onClick={() => { setNameDialog(null); setPendingName(''); }} />
            <Button label="Create" icon="pi pi-check" autoFocus
              disabled={pendingName.trim() === ''}
              onClick={confirmNameDialog} />
          </div>
        }
      >
        <div className="flex flex-column gap-2" style={{minWidth: '20rem'}}>
          <label htmlFor="new-file-name">File name</label>
          <InputText
            id="new-file-name"
            value={pendingName}
            autoFocus
            onChange={e => setPendingName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmNameDialog(); }}
          />
          <small>Paths are relative to the project root, e.g. <code>/parts/bracket.scad</code>.</small>
        </div>
      </Dialog>

    </div>
  )
}
