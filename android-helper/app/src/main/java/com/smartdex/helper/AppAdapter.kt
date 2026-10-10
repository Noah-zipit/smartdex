package com.smartdex.helper

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.util.Locale

/** Grid of launchable apps with a simple label filter. */
class AppAdapter(private val onClick: (AppEntry) -> Unit) :
    RecyclerView.Adapter<AppAdapter.AppViewHolder>() {

    private var all: List<AppEntry> = emptyList()
    private var shown: List<AppEntry> = emptyList()

    fun setApps(apps: List<AppEntry>) {
        all = apps
        shown = apps
        notifyDataSetChanged()
    }

    fun filter(query: String) {
        val q = query.trim().lowercase(Locale.getDefault())
        shown = if (q.isEmpty()) all else all.filter {
            it.label.lowercase(Locale.getDefault()).contains(q)
        }
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return AppViewHolder(view, onClick)
    }

    override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
        holder.bind(shown[position])
    }

    override fun getItemCount(): Int = shown.size

    class AppViewHolder(view: View, private val onClick: (AppEntry) -> Unit) :
        RecyclerView.ViewHolder(view) {

        private val icon: ImageView = view.findViewById(R.id.app_icon)
        private val label: TextView = view.findViewById(R.id.app_label)
        private var entry: AppEntry? = null

        init {
            view.setOnClickListener { entry?.let(onClick) }
        }

        fun bind(entry: AppEntry) {
            this.entry = entry
            icon.setImageDrawable(entry.icon)
            label.text = entry.label
        }
    }
}
