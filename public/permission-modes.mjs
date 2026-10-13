export const permissionModes={
 default:{label:'请求批准',description:'编辑外部文件和使用互联网时始终询问',settings:{approvalPolicy:'on-request',sandboxMode:'workspace-write',networkAccess:false,approvalsReviewer:'user'}},
 guardian:{label:'帮我批准',description:'仅对检测到的风险操作请求批准',settings:{approvalPolicy:'on-request',sandboxMode:'workspace-write',networkAccess:false,approvalsReviewer:'guardian_subagent'}},
 'full-access':{label:'完全访问权限',description:'可不受限制地访问互联网和你电脑上的任何文件',settings:{approvalPolicy:'never',sandboxMode:'danger-full-access',networkAccess:true,approvalsReviewer:'user'}},
};
export function permissionMode(state){
 if(state.approvalPolicy==='never'&&state.sandboxMode==='danger-full-access')return'full-access';
 if(state.approvalPolicy==='on-request'&&state.sandboxMode==='workspace-write'&&state.networkAccess===false)return state.approvalsReviewer==='guardian_subagent'?'guardian':state.approvalsReviewer==null||state.approvalsReviewer==='user'?'default':'custom';
 return'custom';
}
