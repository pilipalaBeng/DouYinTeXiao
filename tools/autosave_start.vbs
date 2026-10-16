' 像塑自动保存守护 —— 启动器
' 作用：脱离父进程树把 autosave.cmd 拉起来，避免进程随发起它的进程一起被回收。
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\Project\DouYinTeXiao\tools"
sh.Run """D:\Project\DouYinTeXiao\tools\autosave.cmd""", 1, False
